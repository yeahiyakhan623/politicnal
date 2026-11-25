import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/origin";
import { assertStudentManagementAccess } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/require-user";
import { apiError, ApiRequestError } from "@/lib/api/http";
import { getPool } from "@/lib/db";
import { MAX_STUDENT_IMPORT_ROWS, readStudentImport } from "@/lib/students/import-parser";
import {
  getStudentImportField,
  mapStudentImportRow,
  normalizeOptionalImportFields,
} from "@/lib/students/import-mapping";
import { resolveInstituteId } from "@/lib/students/service";
import { validateStudentInput } from "@/lib/students/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let client;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    assertStudentManagementAccess(user);
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("multipart/form-data;")) {
      throw new ApiRequestError("Content-Type must be multipart/form-data.", 415);
    }

    const form = await request.formData();
    const file = form.get("file");
    const instituteValue = form.get("instituteId");
    const semesterValue = form.get("semester");
    const departmentValue = form.get("department");
    const sessionYearValue = form.get("sessionYear");
    if (!(file instanceof File)) throw new ApiRequestError("Choose a CSV or XLSX file.", 400);
    if (typeof semesterValue !== "string") throw new ApiRequestError("Select a semester for imported students.", 400);
    const semester = Number(semesterValue);
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
      throw new ApiRequestError("Semester must be between 1 and 8.", 400);
    }
    if (typeof departmentValue !== "string" || !departmentValue.trim()) {
      throw new ApiRequestError("Select a department for imported students.", 400);
    }
    if (departmentValue.trim().length > 100) {
      throw new ApiRequestError("Department must be 100 characters or fewer.", 400);
    }
    const department = departmentValue.trim();
    const instituteId = await resolveInstituteId(
      user,
      typeof instituteValue === "string" ? instituteValue : null,
    );
    const rows = await readStudentImport(file);
    if (rows.length < 2) throw new ApiRequestError("The file contains no student data rows.", 400);

    const headers = rows[0];
    const importFields = new Set(headers.map(getStudentImportField).filter((field) => field !== null));
    if (!importFields.has("fullName") && !importFields.has("rollNumber")) {
      throw new ApiRequestError("Include at least one of the name or roll columns.", 400);
    }

    const existing = await getPool().query<{
      roll_number: string | null;
      registration_number: string | null;
      semester: number;
      department: string | null;
    }>(
      `SELECT roll_number, registration_number, semester, department
       FROM public.students WHERE institute_id=$1`,
      [instituteId],
    );
    const rollKey = (row: { semester: number; department: string | null; roll_number: string | null }) =>
      `${row.semester}|${row.department?.trim().toLowerCase() ?? ""}|${row.roll_number?.trim().toLowerCase() ?? ""}`;
    const seenRolls = new Set(existing.rows.filter((row) => row.roll_number).map(rollKey));
    const seenRegistrations = new Set(existing.rows.filter((row) => row.registration_number).map((row) => row.registration_number!.trim().toLowerCase()));
    const valid: ReturnType<typeof validateStudentInput>[] = [];
    const issues: { row: number; reason: string }[] = [];

    for (let index = 1; index < rows.length; index += 1) {
      if (index > MAX_STUDENT_IMPORT_ROWS) break;
      const cells = rows[index];
      const raw = normalizeOptionalImportFields(mapStudentImportRow(headers, cells));
      try {
        const student = validateStudentInput({
          ...raw,
          semester,
          department,
          sessionYear: raw.sessionYear || sessionYearValue || "",
          status: "active",
        });
        const studentRollKey = `${student.semester}|${student.department?.trim().toLowerCase() ?? ""}|${student.rollNumber.trim().toLowerCase()}`;
        const registrationKey = student.registrationNumber.trim().toLowerCase();
        if (student.rollNumber && seenRolls.has(studentRollKey)) throw new Error("Duplicate roll number in this semester and department.");
        if (student.registrationNumber && seenRegistrations.has(registrationKey)) throw new Error("Duplicate registration number in this institute or file.");
        if (student.rollNumber) seenRolls.add(studentRollKey);
        if (student.registrationNumber) seenRegistrations.add(registrationKey);
        valid.push(student);
      } catch (error) {
        issues.push({
          row: index + 1,
          reason: error instanceof Error ? error.message : "Invalid student row.",
        });
      }
    }
    if (rows.length - 1 > MAX_STUDENT_IMPORT_ROWS) {
      throw new ApiRequestError(`Imports are limited to ${MAX_STUDENT_IMPORT_ROWS} student rows.`, 413);
    }
    if (request.nextUrl.searchParams.get("preview") === "1") {
      return NextResponse.json({
        valid: valid.length,
        rejected: issues.length,
        issues,
        preview: valid.slice(0, 20).map((student) => ({
          fullName: student.fullName,
          rollNumber: student.rollNumber,
          registrationNumber: student.registrationNumber,
        })),
      });
    }
    if (!valid.length) {
      return NextResponse.json({ imported: 0, rejected: issues.length, issues }, { status: 422 });
    }

    client = await getPool().connect();
    await client.query("BEGIN");
    const insertedIds: string[] = [];
    for (const student of valid) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.students
          (institute_id, semester, department, session_year, full_name, roll_number, registration_number, email,
           date_of_birth, guardian_name, guardian_contact, student_phone, father_name, mother_name,
           father_phone, mother_phone, address, is_active, approval_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true,'approved')
         RETURNING id`,
        [
          instituteId, student.semester, student.department, student.sessionYear, student.fullName || null, student.rollNumber || null, student.registrationNumber || null,
          student.email, student.dateOfBirth, student.guardianName, student.guardianContact, student.studentPhone,
          student.fatherName, student.motherName, student.fatherPhone, student.motherPhone, student.address,
        ],
      );
      insertedIds.push(result.rows[0].id);
    }
    await client.query(
      `INSERT INTO public.admin_audit_logs
        (actor_user_id, actor_role, action, target_type, target_id, after_value)
       VALUES ($1,$2,'students.bulk_imported','student_import',$3,$4::jsonb)`,
      [user.id, user.role.toLowerCase(), instituteId, JSON.stringify({
        imported: insertedIds.length,
        rejected: issues.length,
        rowNumbers: issues.map((issue) => issue.row),
      })],
    );
    await client.query("COMMIT");
    return NextResponse.json({
      imported: insertedIds.length,
      rejected: issues.length,
      issues,
      rows: insertedIds,
    }, { status: 201 });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Duplicate roll or registration number detected. No rows were imported; refresh and retry." }, { status: 409 });
    }
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && (
      error.message.includes("required.") || error.message.includes("characters") ||
      error.message.includes("invalid.") || error.message.includes("Semester") ||
      error.message.includes("student name or roll")
    )) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Student import failed.", error);
    return NextResponse.json({ error: "Unable to import students." }, { status: 500 });
  } finally {
    client?.release();
  }
}
