import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, apiError, readJsonBody } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { AuthorizationError } from "@/lib/auth/authorization";
import { requireUser, requireRoles } from "@/lib/auth/require-user";
import { getPool } from "@/lib/db";
import { resolveInstituteId } from "@/lib/students/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (user.role === "STUDENT") {
      if (!user.studentId || !user.instituteId) {
        throw new AuthorizationError("This student account is not linked to an institute record.");
      }
      const result = await getPool().query<{
        sessionYear: string;
        semester: number;
        feeAmount: string;
        paidAmount: string;
        updatedAt: Date | string;
      }>(
        `SELECT session_year AS "sessionYear", semester,
                fee_amount::text AS "feeAmount", paid_amount::text AS "paidAmount",
                updated_at AS "updatedAt"
         FROM public.student_fee_summaries
         WHERE student_id = $1 AND institute_id = $2
         ORDER BY session_year DESC, semester DESC`,
        [user.studentId, user.instituteId],
      );
      return NextResponse.json({ fees: result.rows }, { headers: { "Cache-Control": "no-store" } });
    }

    await requireRoles("SUPER_ADMIN");
    const requestedInstitute = request.nextUrl.searchParams.get("instituteId");
    if (!requestedInstitute || !UUID.test(requestedInstitute)) {
      throw new ApiRequestError("Select an institute to manage student fees.", 400);
    }
    const instituteId = await resolveInstituteId(user, requestedInstitute);
    const rawPage = request.nextUrl.searchParams.get("page") ?? "1";
    const rawPageSize = request.nextUrl.searchParams.get("pageSize") ?? "50";
    const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";
    if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawPageSize)) {
      throw new ApiRequestError("Page and page size must be positive integers.", 400);
    }
    const page = Number(rawPage);
    const pageSize = Number(rawPageSize);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new ApiRequestError("Page must be positive and page size must be between 1 and 100.", 400);
    }
    if (search.length > 100) throw new ApiRequestError("Search must be 100 characters or fewer.", 400);

    const values: unknown[] = [instituteId];
    let searchCondition = "";
    if (search) {
      const escaped = search.replace(/[\\%_]/g, "\\$&");
      values.push(`%${escaped}%`);
      const searchParameter = `$${values.length}`;
      searchCondition = ` AND (
        COALESCE(student.full_name, '') ILIKE ${searchParameter} ESCAPE '\\'
        OR COALESCE(student.roll_number, '') ILIKE ${searchParameter} ESCAPE '\\'
        OR COALESCE(student.registration_number, '') ILIKE ${searchParameter} ESCAPE '\\'
        OR COALESCE(student.department, '') ILIKE ${searchParameter} ESCAPE '\\'
      )`;
    }
    const offset = (page - 1) * pageSize;
    const [count, result] = await Promise.all([
      getPool().query<{ total: string }>(
        `SELECT count(*)::text AS total
         FROM public.students student
         WHERE student.institute_id = $1 AND student.is_active = true${searchCondition}`,
        values,
      ),
      getPool().query<{
      studentId: string;
      fullName: string | null;
      rollNumber: string | null;
      registrationNumber: string | null;
      sessionYear: string | null;
      semester: number;
      department: string | null;
      feeAmount: string | null;
      paidAmount: string | null;
    }>(
      `SELECT student.id AS "studentId", student.full_name AS "fullName",
              student.roll_number AS "rollNumber",
              student.registration_number AS "registrationNumber",
              student.session_year AS "sessionYear", student.semester,
              student.department,
              fee.fee_amount::text AS "feeAmount",
              fee.paid_amount::text AS "paidAmount"
       FROM public.students student
       LEFT JOIN public.student_fee_summaries fee
         ON fee.student_id = student.id
        AND fee.institute_id = student.institute_id
        AND fee.session_year = student.session_year
        AND fee.semester = student.semester
       WHERE student.institute_id = $1 AND student.is_active = true
         ${searchCondition}
       ORDER BY student.semester, student.department, student.roll_number, student.full_name, student.id
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
      ),
    ]);
    const total = Number(count.rows[0]?.total ?? 0);
    return NextResponse.json({
      students: result.rows.map((row) => ({
        ...row,
        feeAmount: row.feeAmount === null ? "" : Number(row.feeAmount).toFixed(2),
        paidAmount: row.paidAmount === null ? "0.00" : Number(row.paidAmount).toFixed(2),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiError(error);
    if (response) return response;
    console.error("Student fee query failed.", error);
    return jsonError("Unable to load student fee records.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  try {
    assertSameOrigin(request);
    const admin = await requireRoles("SUPER_ADMIN");
    const body = await readJsonBody(request, 4_096);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Enter the student fee details.", 400);
    }
    const data = body as Record<string, unknown>;
    const instituteId = typeof data.instituteId === "string" ? data.instituteId : "";
    const studentId = typeof data.studentId === "string" ? data.studentId : "";
    const sessionYear = typeof data.sessionYear === "string" ? data.sessionYear.trim() : "";
    const semester = Number(data.semester);
    const feeAmount = typeof data.feeAmount === "number" ? data.feeAmount : Number(data.feeAmount);
    const paidAmount = typeof data.paidAmount === "number" ? data.paidAmount : Number(data.paidAmount);
    if (!UUID.test(instituteId) || !UUID.test(studentId)) {
      throw new ApiRequestError("Institute and student identifiers are invalid.", 400);
    }
    const resolvedInstitute = await resolveInstituteId(admin, instituteId);
    if (!sessionYear || sessionYear.length > 20 || !Number.isInteger(semester) || semester < 1 || semester > 8) {
      throw new ApiRequestError("Select a valid session and semester.", 400);
    }
    if (
      !Number.isFinite(feeAmount) ||
      !Number.isFinite(paidAmount) ||
      feeAmount < 0 ||
      paidAmount < 0 ||
      paidAmount > feeAmount ||
      Math.round(feeAmount * 100) !== feeAmount * 100 ||
      Math.round(paidAmount * 100) !== paidAmount * 100
    ) {
      throw new ApiRequestError("Fee and paid amounts must be valid, non-negative amounts with paid not exceeding the fee.", 400);
    }

    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const saved = await client.query<{ id: string }>(
      `INSERT INTO public.student_fee_summaries
         (institute_id, student_id, session_year, semester, fee_amount, paid_amount, updated_by)
       SELECT $1, student.id, $3, $4, $5, $6, $7
       FROM public.students student
       WHERE student.id = $2 AND student.institute_id = $1
       ON CONFLICT (student_id, session_year, semester)
       DO UPDATE SET fee_amount = EXCLUDED.fee_amount,
                     paid_amount = EXCLUDED.paid_amount,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = now()
       RETURNING id`,
      [resolvedInstitute, studentId, sessionYear, semester, feeAmount, paidAmount, admin.id],
    );
    if (!saved.rowCount) throw new ApiRequestError("Student record was not found in this institute.", 404);
    await client.query(
      `INSERT INTO public.admin_audit_logs
         (actor_user_id, actor_role, action, target_type, target_id, after_value)
       VALUES ($1, $2, 'student_fee_summary.updated', 'student_fee_summary', $3, $4::jsonb)`,
      [admin.id, admin.role.toLowerCase(), studentId, JSON.stringify({
        instituteId: resolvedInstitute,
        sessionYear,
        semester,
        feeAmount,
        paidAmount,
      })],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    return NextResponse.json({ success: true });
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) return jsonError(error.message, error.status);
    console.error("Student fee update failed.", error);
    return jsonError("Unable to save the student fee record.", 500);
  } finally {
    client?.release();
  }
}
