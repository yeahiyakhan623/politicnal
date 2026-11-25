import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, apiError, readJsonBody } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { AuthorizationError } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/require-user";
import { getPool } from "@/lib/db";
import { resolveInstituteId } from "@/lib/students/service";

export const runtime = "nodejs";

const HISTORY_PAGE_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertAttendanceAccess(role: string) {
  if (!["SUPER_ADMIN", "INSTITUTE_ADMIN", "TEACHER"].includes(role)) {
    throw new AuthorizationError("Only administrators and teachers can manage attendance.");
  }
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function parseSemester(value: string | null) {
  if (value === null || !/^[1-8]$/.test(value)) {
    throw new ApiRequestError("Semester must be between 1 and 8.", 400);
  }
  return Number(value);
}

async function getHistory(request: NextRequest, instituteId: string) {
  const query = request.nextUrl.searchParams;
  const conditions = ["a.institute_id = $1"];
  const values: (string | number)[] = [instituteId];
  const add = (value: string | number, expression: (index: number) => string) => {
    values.push(value);
    conditions.push(expression(values.length));
  };

  const date = query.get("date")?.trim() ?? "";
  const month = query.get("month")?.trim() ?? "";
  if (date && !validDate(date)) throw new ApiRequestError("Attendance date is invalid.", 400);
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ApiRequestError("Attendance month is invalid.", 400);
  }
  if (date) add(date, (index) => `a.attendance_date = $${index}::date`);
  if (month) {
    const [yearText, monthText] = month.split("-");
    const year = Number(yearText);
    const monthNumber = Number(monthText);
    const first = `${yearText}-${monthText}-01`;
    const next = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
    add(first, (index) => `a.attendance_date >= $${index}::date`);
    add(next, (index) => `a.attendance_date < $${index}::date`);
  }
  const semesterValue = query.get("semester");
  if (semesterValue) add(parseSemester(semesterValue), (index) => `a.semester = $${index}`);
  const department = query.get("department")?.trim() ?? "";
  if (department.length > 100) throw new ApiRequestError("Department must be 100 characters or fewer.", 400);
  if (department) add(department, (index) => `a.department = $${index}`);
  const search = query.get("search")?.trim() ?? "";
  if (search.length > 100) throw new ApiRequestError("Search must be 100 characters or fewer.", 400);
  if (search) add(`%${search}%`, (index) => `(COALESCE(a.student_name, '') ILIKE $${index} OR COALESCE(a.roll_number, '') ILIKE $${index})`);

  const rawPage = query.get("page") ?? "1";
  if (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(Number(rawPage)) || Number(rawPage) < 1 || Number(rawPage) > 1_000_000) {
    throw new ApiRequestError("History page must be a positive integer.", 400);
  }
  const page = Number(rawPage);
  const offset = (page - 1) * HISTORY_PAGE_SIZE;
  const paginatedValues = [...values, HISTORY_PAGE_SIZE, offset];
  const [count, result] = await Promise.all([
    getPool().query<{ total: string }>(
      `SELECT count(*)::text AS total
       FROM public.attendance_records a
       WHERE ${conditions.join(" AND ")}`,
      values,
    ),
    getPool().query<{
    id: string;
    studentId: string;
    attendanceDate: string;
    semester: number;
    department: string;
    studentName: string | null;
    rollNumber: string | null;
    status: "present" | "absent";
    markedAt: Date;
  }>(
    `SELECT a.id, a.student_id AS "studentId", a.attendance_date::text AS "attendanceDate",
            a.semester, a.department, a.student_name AS "studentName",
            a.roll_number AS "rollNumber", a.status, a.marked_at AS "markedAt"
     FROM public.attendance_records a
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.attendance_date DESC, a.semester, a.department,
              a.roll_number NULLS LAST, a.student_name
     LIMIT $${paginatedValues.length - 1} OFFSET $${paginatedValues.length}`,
      paginatedValues,
    ),
  ]);
  const total = Number(count.rows[0]?.total ?? 0);
  return NextResponse.json({
    data: result.rows,
    pagination: { page, pageSize: HISTORY_PAGE_SIZE, total, totalPages: Math.ceil(total / HISTORY_PAGE_SIZE) },
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    assertAttendanceAccess(user.role);
    const query = request.nextUrl.searchParams;
    const instituteId = await resolveInstituteId(user, query.get("instituteId"));
    if (query.get("mode") === "history") return await getHistory(request, instituteId);

    const semester = parseSemester(query.get("semester"));
    const department = query.get("department")?.trim() ?? "";
    const date = query.get("date")?.trim() ?? "";
    if (!department || department.length > 100) {
      throw new ApiRequestError("Select a department to load the attendance sheet.", 400);
    }
    if (!validDate(date)) throw new ApiRequestError("Attendance date is invalid.", 400);
    const result = await getPool().query<{
      id: string;
      fullName: string | null;
      rollNumber: string | null;
      status: "present" | "absent" | null;
    }>(
      `SELECT s.id, s.full_name AS "fullName", s.roll_number AS "rollNumber",
              a.status
       FROM public.students s
       LEFT JOIN public.attendance_records a
         ON a.student_id=s.id AND a.institute_id=s.institute_id AND a.attendance_date=$4::date
       WHERE s.institute_id=$1 AND s.semester=$2 AND s.department=$3
         AND s.is_active=true AND s.approval_status='approved'
       ORDER BY s.roll_number NULLS LAST, s.full_name`,
      [instituteId, semester, department, date],
    );
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    const response = apiError(error);
    if (response) return response;
    console.error("Attendance sheet request failed.", error);
    return NextResponse.json({ error: "Unable to load attendance." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    assertAttendanceAccess(user.role);
    const body = await readJsonBody(request, 1_000_000);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Attendance data is required.", 400);
    }
    const data = body as Record<string, unknown>;
    const instituteId = await resolveInstituteId(
      user,
      typeof data.instituteId === "string" ? data.instituteId : null,
    );
    if (!Number.isInteger(data.semester) || Number(data.semester) < 1 || Number(data.semester) > 8) {
      throw new ApiRequestError("Semester must be between 1 and 8.", 400);
    }
    const semester = Number(data.semester);
    const department = typeof data.department === "string" ? data.department.trim() : "";
    if (!department || department.length > 100) {
      throw new ApiRequestError("Select a department for attendance.", 400);
    }
    const attendanceDate = typeof data.date === "string" ? data.date : "";
    if (!validDate(attendanceDate)) throw new ApiRequestError("Attendance date is invalid.", 400);
    if (!Array.isArray(data.records) || data.records.length > 5000 || data.records.length === 0) {
      throw new ApiRequestError("Attendance must contain at least one student and no more than 5000 students.", 400);
    }
    const records: { studentId: string; status: "present" | "absent" }[] = [];
    const seen = new Set<string>();
    for (const value of data.records) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ApiRequestError("An attendance selection is invalid.", 400);
      }
      const record = value as Record<string, unknown>;
      if (typeof record.studentId !== "string" || !UUID_PATTERN.test(record.studentId) ||
        (record.status !== "present" && record.status !== "absent") || seen.has(record.studentId)) {
        throw new ApiRequestError("Every student must have one valid Present or Absent selection.", 400);
      }
      seen.add(record.studentId);
      records.push({ studentId: record.studentId, status: record.status });
    }

    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const roster = await client.query<{
      id: string;
      full_name: string | null;
      roll_number: string | null;
    }>(
      `SELECT id, full_name, roll_number
       FROM public.students
       WHERE institute_id=$1 AND semester=$2 AND department=$3
         AND is_active=true AND approval_status='approved'
       FOR SHARE`,
      [instituteId, semester, department],
    );
    if (roster.rowCount !== records.length ||
      roster.rows.some((student) => !seen.has(student.id))) {
      throw new ApiRequestError("The submitted attendance must include every currently enrolled student in this semester and department.", 409);
    }
    const studentMap = new Map(roster.rows.map((student) => [student.id, student]));
    const orderedRecords = records.map((record) => ({ ...record, student: studentMap.get(record.studentId)! }));
    await client.query(
      `INSERT INTO public.attendance_records
         (institute_id, student_id, attendance_date, semester, department,
          student_name, roll_number, status, marked_by, marked_at)
       SELECT $1, entry.student_id, $2::date, $3, $4,
              entry.student_name, entry.roll_number, entry.status, $5, now()
       FROM unnest($6::uuid[], $7::text[], $8::text[], $9::text[])
         AS entry(student_id, student_name, roll_number, status)
       ON CONFLICT (institute_id, student_id, attendance_date)
       DO UPDATE SET semester=EXCLUDED.semester, department=EXCLUDED.department,
                     student_name=EXCLUDED.student_name, roll_number=EXCLUDED.roll_number,
                     status=EXCLUDED.status, marked_by=EXCLUDED.marked_by,
                     marked_at=now(), updated_at=now()`,
      [
        instituteId,
        attendanceDate,
        semester,
        department,
        user.id,
        orderedRecords.map((record) => record.studentId),
        orderedRecords.map((record) => record.student.full_name),
        orderedRecords.map((record) => record.student.roll_number),
        orderedRecords.map((record) => record.status),
      ],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    return NextResponse.json({ saved: records.length, date: attendanceDate });
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Attendance save failed.", error);
    return NextResponse.json({ error: "Unable to save attendance." }, { status: 500 });
  } finally {
    client?.release();
  }
}
