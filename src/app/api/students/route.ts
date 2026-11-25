import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/origin";
import { assertStudentManagementAccess } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/require-user";
import { getPool } from "@/lib/db";
import { apiError, readJsonBody, validationError } from "@/lib/api/http";
import {
  getStudentForUser,
  listStudents,
  resolveInstituteId,
} from "@/lib/students/service";
import { validateStudentInput } from "@/lib/students/validation";

export const runtime = "nodejs";

function parseBoundedInteger(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new Error("Pagination values must be positive integers.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Pagination values must be between ${min} and ${max}.`);
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const query = request.nextUrl.searchParams;
    if (user.role === "STUDENT") {
      const student = await getStudentForUser(user.id, user.studentId);
      return NextResponse.json({
        data: student ? [student] : [],
        pagination: { page: 1, pageSize: 1, total: student ? 1 : 0, totalPages: student ? 1 : 0 },
      });
    }
    assertStudentManagementAccess(user);

    const page = parseBoundedInteger(query.get("page"), 1, 1, 1_000_000);
    const pageSize = parseBoundedInteger(query.get("pageSize"), 20, 1, 100);
    const search = query.get("search")?.trim() ?? "";
    if (search.length > 100) throw new Error("Search must be 100 characters or fewer.");
    const department = query.get("department")?.trim() ?? "";
    const rawSemester = query.get("semester")?.trim() ?? "1";
    const semester = Number(rawSemester);
    const sessionYear = query.get("sessionYear")?.trim() ?? "";
    if (department.length > 100 || sessionYear.length > 20) throw new Error("A directory filter is too long.");
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
      throw new Error("Semester filter must be between 1 and 8.");
    }
    if (sessionYear && !/^(?:\d{4}|\d{4}-\d{2}|\d{4}-\d{4})$/.test(sessionYear)) {
      throw new Error("Session year filter is invalid.");
    }

    const instituteId = await resolveInstituteId(user, query.get("instituteId"));
    const [result, counts, semesterCounts, departmentCounts, sessionYears] = await Promise.all([
      listStudents({ instituteId, page, pageSize, search, department, semester, sessionYear }),
      getPool().query<{ total: string; active: string; pending: string }>(
        `SELECT count(*)::text AS total,
          count(*) FILTER (WHERE is_active = true AND approval_status = 'approved')::text AS active,
          count(*) FILTER (WHERE approval_status = 'pending')::text AS pending
         FROM public.students WHERE institute_id = $1`,
        [instituteId],
      ),
      getPool().query<{ semester: number; count: string }>(
        `SELECT terms.semester, count(s.id)::text AS count
         FROM generate_series(1, 8) AS terms(semester)
         LEFT JOIN public.students s ON s.institute_id=$1 AND s.semester=terms.semester
         GROUP BY terms.semester ORDER BY terms.semester`,
        [instituteId],
      ),
      getPool().query<{ semester: number; department: string; count: string }>(
        `SELECT semester, department, count(*)::text AS count
         FROM public.students
         WHERE institute_id=$1 AND department IS NOT NULL AND trim(department) <> ''
         GROUP BY semester, department
         ORDER BY semester, department`,
        [instituteId],
      ),
      getPool().query<{ session_year: string }>(
        `SELECT DISTINCT session_year
         FROM public.students
         WHERE institute_id=$1 AND session_year IS NOT NULL AND trim(session_year) <> ''
         ORDER BY session_year DESC`,
        [instituteId],
      ),
    ]);
    return NextResponse.json({
      ...result,
      instituteId,
      stats: {
        totalStudents: Number(counts.rows[0]?.total ?? 0),
        activeStudents: Number(counts.rows[0]?.active ?? 0),
        pendingStudents: Number(counts.rows[0]?.pending ?? 0),
      },
      semesterCounts: semesterCounts.rows.map((row) => ({ semester: Number(row.semester), count: Number(row.count) })),
      departmentCounts: departmentCounts.rows.map((row) => ({
        semester: Number(row.semester),
        department: row.department,
        count: Number(row.count),
      })),
      sessionYears: sessionYears.rows.map((row) => row.session_year),
    });
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes("Pagination") ||
      error.message.includes("Search must") ||
      error.message.includes("filter") ||
      error.message.includes("Semester filter") ||
      error.message.includes("Session year filter")
    )) return validationError(error);
    const response = apiError(error);
    if (response) return response;
    console.error("Student list query failed.", error);
    return NextResponse.json({ error: "Unable to load students." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let client;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    assertStudentManagementAccess(user);
    const input = validateStudentInput(await readJsonBody(request));
    const instituteId = await resolveInstituteId(user, input.instituteId);
    client = await getPool().connect();
    await client.query("BEGIN");
    const duplicate = await client.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM public.students
           WHERE institute_id=$1 AND semester=$2
             AND COALESCE(lower(trim(department)), '')=COALESCE(lower(trim($3)), '')
             AND $4 <> '' AND lower(trim(roll_number))=lower(trim($4))
         ) AS duplicate_roll,
         EXISTS (
           SELECT 1 FROM public.students
           WHERE institute_id=$1 AND $5 <> ''
             AND lower(trim(registration_number))=lower(trim($5))
         ) AS duplicate_registration`,
      [instituteId, input.semester, input.department, input.rollNumber, input.registrationNumber],
    );
    if (duplicate.rows[0].duplicate_roll) throw new Error("Roll number already exists in this semester and department.");
    if (duplicate.rows[0].duplicate_registration) throw new Error("Registration number already exists in this institute.");

    const approvalStatus = input.status === "pending" ? "pending" : input.status === "rejected" ? "rejected" : "approved";
    const isActive = input.status === "active";
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO public.students
        (institute_id, semester, department, session_year, full_name, roll_number, registration_number, email,
         date_of_birth, guardian_name, guardian_contact, student_phone, father_name, mother_name,
         father_phone, mother_phone, address, is_active, approval_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        instituteId, input.semester, input.department, input.sessionYear, input.fullName || null, input.rollNumber || null, input.registrationNumber || null,
        input.email, input.dateOfBirth, input.guardianName, input.guardianContact, input.studentPhone,
        input.fatherName, input.motherName, input.fatherPhone, input.motherPhone, input.address, isActive, approvalStatus,
      ],
    );
    const studentId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO public.admin_audit_logs
        (actor_user_id, actor_role, action, target_type, target_id, after_value)
       VALUES ($1,$2,'student.created','student',$3,$4::jsonb)`,
      [user.id, user.role.toLowerCase(), studentId, JSON.stringify({
        fullName: input.fullName,
        rollNumber: input.rollNumber,
        registrationNumber: input.registrationNumber,
        semester: input.semester,
        department: input.department,
        sessionYear: input.sessionYear,
        status: input.status,
      })],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: { id: studentId } }, { status: 201 });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof Error && error.message.includes("already exists")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Roll or registration number already exists." }, { status: 409 });
    }
    if (error instanceof Error && (
      error.message.includes("required.") || error.message.includes("characters") ||
      error.message.includes("invalid.") || error.message.includes("Semester") ||
      error.message.includes("student name or roll")
    )) return validationError(error);
    const response = apiError(error);
    if (response) return response;
    console.error("Student create failed.", error);
    return NextResponse.json({ error: "Unable to create student." }, { status: 500 });
  } finally {
    client?.release();
  }
}
