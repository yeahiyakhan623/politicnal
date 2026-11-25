import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/origin";
import { assertStudentManagementAccess } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/require-user";
import { apiError, readJsonBody, validationError } from "@/lib/api/http";
import { getPool } from "@/lib/db";
import { resolveInstituteId } from "@/lib/students/service";
import { validateStudentId, validateStudentInput } from "@/lib/students/validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  let client;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    assertStudentManagementAccess(user);
    const { id } = await context.params;
    validateStudentId(id);
    const input = validateStudentInput(await readJsonBody(request));
    const instituteId = await resolveInstituteId(user, input.instituteId);
    client = await getPool().connect();
    await client.query("BEGIN");
    const beforeResult = await client.query<{
      full_name: string | null;
      roll_number: string | null;
      registration_number: string | null;
      semester: number;
      department: string | null;
      session_year: string | null;
      is_active: boolean;
      approval_status: string;
    }>(
      `SELECT full_name, roll_number, registration_number, semester, department, session_year, is_active, approval_status
       FROM public.students WHERE id=$1 AND institute_id=$2 FOR UPDATE`,
      [id, instituteId],
    );
    const before = beforeResult.rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Student record was not found." }, { status: 404 });
    }

    const duplicate = await client.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM public.students
           WHERE id<>$1 AND institute_id=$2 AND semester=$3
             AND COALESCE(lower(trim(department)), '')=COALESCE(lower(trim($4)), '')
             AND $5 <> '' AND lower(trim(roll_number))=lower(trim($5))
         ) AS duplicate_roll,
         EXISTS (
           SELECT 1 FROM public.students
           WHERE id<>$1 AND institute_id=$2 AND $6 <> ''
             AND lower(trim(registration_number))=lower(trim($6))
         ) AS duplicate_registration`,
      [id, instituteId, input.semester, input.department, input.rollNumber, input.registrationNumber],
    );
    if (duplicate.rows[0].duplicate_roll) throw new Error("Roll number already exists in this semester and department.");
    if (duplicate.rows[0].duplicate_registration) throw new Error("Registration number already exists in this institute.");

    const approvalStatus = input.status === "pending" ? "pending" : input.status === "rejected" ? "rejected" : "approved";
    const isActive = input.status === "active";
    await client.query(
      `UPDATE public.students SET
        semester=$3, department=$4, session_year=$5, full_name=$6, roll_number=$7, registration_number=$8, email=$9,
        date_of_birth=$10, guardian_name=$11, guardian_contact=$12, student_phone=$13,
        father_name=$14, mother_name=$15, father_phone=$16, mother_phone=$17, address=$18,
        is_active=$19, approval_status=$20, updated_at=now()
       WHERE id=$1 AND institute_id=$2`,
      [
        id, instituteId, input.semester, input.department, input.sessionYear, input.fullName || null, input.rollNumber || null, input.registrationNumber || null,
        input.email, input.dateOfBirth, input.guardianName, input.guardianContact, input.studentPhone,
        input.fatherName, input.motherName, input.fatherPhone, input.motherPhone, input.address, isActive, approvalStatus,
      ],
    );
    const accountState = await client.query<{ id: string }>(
      `UPDATE public.users
       SET is_active=$2, token_version=token_version + 1, updated_at=now()
       WHERE student_id=$1 AND role='student' AND is_active IS DISTINCT FROM $2
       RETURNING id`,
      [id, isActive],
    );
    if (accountState.rowCount) {
      await client.query("DELETE FROM public.eduportal_sessions WHERE user_id = ANY($1::uuid[])", [
        accountState.rows.map((account) => account.id),
      ]);
    }
    if (!isActive || approvalStatus !== "approved") {
      await client.query(
        `UPDATE public.student_nfc_cards
         SET revoked_at = now()
         WHERE student_id = $1 AND institute_id = $2 AND revoked_at IS NULL`,
        [id, instituteId],
      );
    }
    const after = {
      fullName: input.fullName,
      rollNumber: input.rollNumber,
      registrationNumber: input.registrationNumber,
      semester: input.semester,
      department: input.department,
      sessionYear: input.sessionYear,
      status: input.status,
    };
    await client.query(
      `INSERT INTO public.admin_audit_logs
        (actor_user_id, actor_role, action, target_type, target_id, before_value, after_value)
       VALUES ($1,$2,'student.updated','student',$3,$4::jsonb,$5::jsonb)`,
      [
        user.id, user.role.toLowerCase(), id,
        JSON.stringify({
          fullName: before.full_name,
          rollNumber: before.roll_number,
          registrationNumber: before.registration_number,
          semester: before.semester,
          department: before.department,
          sessionYear: before.session_year,
          isActive: before.is_active,
          approvalStatus: before.approval_status,
        }),
        JSON.stringify(after),
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: { id } });
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
      error.message.includes("student name or roll") ||
      error.message.includes("Student record ID")
    )) return validationError(error);
    const response = apiError(error);
    if (response) return response;
    console.error("Student update failed.", error);
    return NextResponse.json({ error: "Unable to update student." }, { status: 500 });
  } finally {
    client?.release();
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  let client;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    assertStudentManagementAccess(user);
    const { id } = await context.params;
    validateStudentId(id);
    const requestedInstitute = request.nextUrl.searchParams.get("instituteId");
    const instituteId = await resolveInstituteId(user, requestedInstitute);
    client = await getPool().connect();
    await client.query("BEGIN");
    const beforeResult = await client.query<{
      full_name: string;
      roll_number: string;
      registration_number: string | null;
      is_active: boolean;
      approval_status: string;
    }>(
      `SELECT full_name, roll_number, registration_number, is_active, approval_status
       FROM public.students WHERE id=$1 AND institute_id=$2 FOR UPDATE`,
      [id, instituteId],
    );
    const before = beforeResult.rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Student record was not found." }, { status: 404 });
    }
    if (!before.is_active && before.approval_status === "approved") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Student is already inactive." }, { status: 409 });
    }
    await client.query(
      `UPDATE public.students SET is_active=false, updated_at=now()
       WHERE id=$1 AND institute_id=$2`,
      [id, instituteId],
    );
    const deactivatedAccounts = await client.query<{ id: string }>(
      `UPDATE public.users
       SET is_active=false, token_version=token_version + 1, updated_at=now()
       WHERE student_id=$1 AND role='student' AND is_active=true
       RETURNING id`,
      [id],
    );
    if (deactivatedAccounts.rowCount) {
      await client.query("DELETE FROM public.eduportal_sessions WHERE user_id = ANY($1::uuid[])", [
        deactivatedAccounts.rows.map((account) => account.id),
      ]);
    }
    await client.query(
      `UPDATE public.student_nfc_cards
       SET revoked_at = now()
       WHERE student_id = $1 AND institute_id = $2 AND revoked_at IS NULL`,
      [id, instituteId],
    );
    await client.query(
      `INSERT INTO public.admin_audit_logs
        (actor_user_id, actor_role, action, target_type, target_id, before_value, after_value)
       VALUES ($1,$2,'student.deactivated','student',$3,$4::jsonb,$5::jsonb)`,
      [
        user.id, user.role.toLowerCase(), id,
        JSON.stringify({
          fullName: before.full_name,
          rollNumber: before.roll_number,
          registrationNumber: before.registration_number,
          isActive: before.is_active,
          approvalStatus: before.approval_status,
        }),
        JSON.stringify({ isActive: false, approvalStatus: before.approval_status }),
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: { id, status: "inactive" } });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    try { validateStudentId((await context.params).id); }
    catch (validation) { return validationError(validation); }
    const response = apiError(error);
    if (response) return response;
    console.error("Student deactivation failed.", error);
    return NextResponse.json({ error: "Unable to deactivate student." }, { status: 500 });
  } finally {
    client?.release();
  }
}
