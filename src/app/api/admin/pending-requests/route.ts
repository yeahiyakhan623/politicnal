import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, apiError, readJsonBody } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { requireRoles } from "@/lib/auth/require-user";
import { decryptApplicantData } from "@/lib/applications/encryption";
import { getStudentPortalUrls } from "@/lib/email/config";
import {
  sendPasswordSetupConfirmationEmail,
  sendStudentApprovalEmail,
  sendStudentRejectionEmail,
  sendStudentRequestReceivedEmail,
} from "@/lib/email/service";
import { getPool } from "@/lib/db";
import { resolveInstituteId } from "@/lib/students/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APPLICATION_STATUSES = new Set(["submitted", "under_review", "accepted", "rejected"]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function newInitialPassword() {
  return randomBytes(18).toString("base64url");
}

async function writeAudit(
  client: PoolClient,
  user: { id: string; role: string },
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO public.admin_audit_logs
       (actor_user_id, actor_role, action, target_type, target_id, after_value)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [user.id, user.role.toLowerCase(), action, targetType, targetId, JSON.stringify(details)],
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireRoles("SUPER_ADMIN");
    const requestedInstitute = request.nextUrl.searchParams.get("instituteId");
    if (!requestedInstitute || !UUID.test(requestedInstitute)) {
      throw new ApiRequestError("Select an institute to review pending requests.", 400);
    }
    const instituteId = await resolveInstituteId(user, requestedInstitute);
    await getPool().query(
      `UPDATE public.student_account_email_deliveries
       SET status = 'failed',
           last_error = COALESCE(last_error, 'Previous delivery attempt did not finish.'),
           updated_at = now()
       WHERE status = 'sending'
         AND last_attempt_at < now() - interval '2 minutes'`,
    );
    const [studentResult, applicationResult] = await Promise.all([
      getPool().query<{
        id: string;
        studentId: string;
        loginId: string | null;
        fullName: string;
        fatherName: string;
        rollNumber: string;
        registrationNumber: string;
        email: string;
        phone: string;
        requestedAt: Date | string;
        status: string;
        passwordChangeRequired: boolean | null;
        credentialsEmailSentAt: Date | string | null;
        rejectionReason: string | null;
        reviewedAt: Date | string | null;
        approvalEmailStatus: string | null;
        approvalEmailAttempts: number | null;
        approvalEmailError: string | null;
        rejectionEmailStatus: string | null;
        rejectionEmailAttempts: number | null;
        rejectionEmailError: string | null;
        requestEmailStatus: string | null;
        requestEmailAttempts: number | null;
        requestEmailError: string | null;
        setupConfirmationEmailStatus: string | null;
        setupConfirmationEmailAttempts: number | null;
        setupConfirmationEmailError: string | null;
        department: string | null;
        semester: number;
        sessionYear: string | null;
      }>(
        `SELECT request.id, request.student_id AS "studentId",
                request.full_name AS "fullName", request.father_name AS "fatherName",
                request.roll_number AS "rollNumber",
                request.registration_number AS "registrationNumber",
                request.email, request.phone, request.requested_at AS "requestedAt",
                request.status,
                account.username AS "loginId",
                account.password_change_required AS "passwordChangeRequired",
                request.credentials_email_sent_at AS "credentialsEmailSentAt",
                request.rejection_reason AS "rejectionReason",
                request.reviewed_at AS "reviewedAt",
                approval_email.status AS "approvalEmailStatus",
                approval_email.attempt_count AS "approvalEmailAttempts",
                approval_email.last_error AS "approvalEmailError",
                rejection_email.status AS "rejectionEmailStatus",
                rejection_email.attempt_count AS "rejectionEmailAttempts",
                rejection_email.last_error AS "rejectionEmailError",
                request_email.status AS "requestEmailStatus",
                request_email.attempt_count AS "requestEmailAttempts",
                request_email.last_error AS "requestEmailError",
                setup_email.status AS "setupConfirmationEmailStatus",
                setup_email.attempt_count AS "setupConfirmationEmailAttempts",
                setup_email.last_error AS "setupConfirmationEmailError",
                student.department, student.semester, student.session_year AS "sessionYear"
         FROM public.student_account_requests request
         LEFT JOIN public.students student ON student.id = request.student_id
         LEFT JOIN public.users account ON account.id = request.account_user_id
         LEFT JOIN public.student_account_email_deliveries approval_email
           ON approval_email.request_id = request.id
          AND approval_email.notification_type = 'approval'
         LEFT JOIN public.student_account_email_deliveries rejection_email
           ON rejection_email.request_id = request.id
          AND rejection_email.notification_type = 'rejection'
         LEFT JOIN public.student_account_email_deliveries request_email
           ON request_email.request_id = request.id
          AND request_email.notification_type = 'request_received'
         LEFT JOIN public.student_account_email_deliveries setup_email
           ON setup_email.request_id = request.id
          AND setup_email.notification_type = 'password_setup_confirmation'
         WHERE request.institute_id = $1
         ORDER BY
           CASE WHEN request.status = 'pending' THEN 0 ELSE 1 END,
           request.requested_at DESC
         LIMIT 200`,
        [instituteId],
      ),
      getPool().query<{
        id: string;
        trackingId: string;
        status: string;
        submittedAt: Date | string;
        title: string;
        applicantDataEncrypted: Buffer;
      }>(
        `SELECT application.id, application.tracking_id AS "trackingId",
                application.status, application.submitted_at AS "submittedAt",
                notice.title,
                application.applicant_data_encrypted AS "applicantDataEncrypted"
         FROM public.institute_admission_applications application
         JOIN public.notices notice
           ON notice.id = application.notice_id AND notice.institute_id = application.institute_id
         WHERE application.institute_id = $1
         ORDER BY application.submitted_at DESC
         LIMIT 200`,
        [instituteId],
      ),
    ]);

    const applications = applicationResult.rows.map((row) => {
      const applicant = decryptApplicantData<{
        fullName?: string;
        email?: string;
        phone?: string;
        department?: string;
        semester?: string | number;
        sessionYear?: string;
        message?: string;
      }>(row.applicantDataEncrypted);
      return {
        id: row.id,
        trackingId: row.trackingId,
        status: row.status,
        submittedAt: new Date(row.submittedAt).toISOString(),
        title: row.title,
        applicant: {
          fullName: applicant.fullName ?? "",
          email: applicant.email ?? "",
          phone: applicant.phone ?? "",
          department: applicant.department ?? "",
          semester: applicant.semester ?? "",
          sessionYear: applicant.sessionYear ?? "",
          message: applicant.message ?? "",
        },
      };
    });

    return NextResponse.json({
      studentRequests: studentResult.rows.map((row) => ({
        ...row,
        requestedAt: new Date(row.requestedAt).toISOString(),
        reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).toISOString() : null,
        credentialsEmailSentAt: row.credentialsEmailSentAt
          ? new Date(row.credentialsEmailSentAt).toISOString()
          : null,
        approvalEmailStatus: row.approvalEmailStatus ?? "not_sent",
        approvalEmailAttempts: row.approvalEmailAttempts ?? 0,
        rejectionEmailStatus: row.rejectionEmailStatus ?? "not_sent",
        rejectionEmailAttempts: row.rejectionEmailAttempts ?? 0,
        requestEmailStatus: row.requestEmailStatus ?? "not_sent",
        requestEmailAttempts: row.requestEmailAttempts ?? 0,
        setupConfirmationEmailStatus: row.setupConfirmationEmailStatus ?? "not_sent",
        setupConfirmationEmailAttempts: row.setupConfirmationEmailAttempts ?? 0,
        setupConfirmationEmailError: row.setupConfirmationEmailError,
        passwordChangeRequired: row.passwordChangeRequired,
      })),
      admissionApplications: applications,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiError(error);
    if (response) return response;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "42P01" || error.code === "42703")
    ) {
      console.error("Pending request schema is missing on the configured database.", error);
      return jsonError(
        "Student request storage is not installed on this database. Production was not changed. Set up and verify a separate staging database before applying the required migrations.",
        503,
      );
    }
    console.error("Pending request query failed.", error);
    return jsonError("Unable to load pending requests.", 500);
  }
}

async function deliverCredentials(input: {
  requestId: string;
  instituteId: string;
  notificationType: "request_received" | "approval" | "rejection" | "password_setup_confirmation";
  temporaryPassword?: string;
}) {
  const client = await getPool().connect();
  let emailPayload:
    | {
        email: string;
        name: string;
        loginId?: string;
        temporaryPassword?: string;
        rollNumber: string;
        registrationNumber: string;
        reason: string | null;
        setupToken: string | null;
        type: "request_received" | "approval" | "rejection" | "password_setup_confirmation";
      }
    | null = null;
  try {
    await client.query("BEGIN");
    const request = await client.query<{
      id: string;
      studentId: string;
      fullName: string;
      rollNumber: string;
      registrationNumber: string;
      email: string;
      status: string;
      accountUserId: string | null;
      loginId: string | null;
      rejectionReason: string | null;
      passwordChangeRequired: boolean | null;
    }>(
      `SELECT request.id, request.student_id AS "studentId",
              request.full_name AS "fullName",
              request.roll_number AS "rollNumber",
              request.registration_number AS "registrationNumber",
              request.email, request.status,
              request.account_user_id AS "accountUserId",
              account.username AS "loginId",
              request.rejection_reason AS "rejectionReason",
              account.password_change_required AS "passwordChangeRequired"
       FROM public.student_account_requests
       request
       LEFT JOIN public.users account ON account.id = request.account_user_id
       WHERE request.id = $1 AND request.institute_id = $2
       FOR UPDATE OF request`,
      [input.requestId, input.instituteId],
    );
    const row = request.rows[0];
    if (!row) throw new ApiRequestError("Student account request was not found.", 404);
    const expectedStatus = input.notificationType === "rejection"
      ? "rejected"
      : input.notificationType === "request_received"
        ? "pending"
        : "approved";
    if (row.status !== expectedStatus) {
      throw new ApiRequestError("This request is not ready for that email notification.", 409);
    }

    const deliveryResult = await client.query<{
      status: string;
      lastAttemptAt: Date | string | null;
    }>(
      `SELECT status, last_attempt_at AS "lastAttemptAt"
       FROM public.student_account_email_deliveries
       WHERE request_id = $1 AND notification_type = $2
       FOR UPDATE`,
      [row.id, input.notificationType],
    );
    const delivery = deliveryResult.rows[0];
    if (!delivery) throw new ApiRequestError("No email delivery is queued for this request.", 409);
    if (delivery.status === "sent") {
      await client.query("COMMIT");
      return { emailSent: true, alreadySent: true };
    }
    if (
      delivery.status === "pending" &&
      delivery.lastAttemptAt &&
      Date.now() - new Date(delivery.lastAttemptAt).getTime() < 120_000
    ) {
      throw new ApiRequestError("An email delivery attempt is already in progress.", 409);
    }

    if (input.notificationType === "approval") {
      if (!row.accountUserId) throw new ApiRequestError("The approved request has no linked student account.", 409);
      if (row.passwordChangeRequired === false) {
        await client.query(
          `UPDATE public.student_account_email_deliveries
           SET status = 'sent', sent_at = COALESCE(sent_at, now()),
               last_error = NULL, updated_at = now()
           WHERE request_id = $1 AND notification_type = 'approval'`,
          [row.id],
        );
        await client.query("COMMIT");
        return { emailSent: true, alreadySent: true };
      }

      const temporaryPassword = input.temporaryPassword ?? newInitialPassword();
      if (!input.temporaryPassword) {
        const passwordHash = await hash(temporaryPassword, 12);
        await client.query(
          `UPDATE public.users
           SET password_hash = $2, password_change_required = true,
               token_version = token_version + 1, updated_at = now()
           WHERE id = $1 AND role = 'student' AND is_active = true`,
          [row.accountUserId, passwordHash],
        );
        await client.query("DELETE FROM public.eduportal_sessions WHERE user_id = $1", [row.accountUserId]);
      }
      await client.query(
        `UPDATE public.student_password_setup_tokens
         SET used_at = COALESCE(used_at, now())
         WHERE user_id = $1 AND used_at IS NULL`,
        [row.accountUserId],
      );
      emailPayload = {
        email: row.email,
        name: row.fullName,
        loginId: row.loginId ?? row.rollNumber,
        temporaryPassword,
        rollNumber: row.rollNumber,
        registrationNumber: row.registrationNumber,
        reason: null,
        setupToken: null,
        type: "approval",
      };
    } else if (input.notificationType === "rejection") {
      emailPayload = {
        email: row.email,
        name: row.fullName,
        rollNumber: row.rollNumber,
        registrationNumber: row.registrationNumber,
        reason: row.rejectionReason,
        setupToken: null,
        type: "rejection",
      };
    } else if (input.notificationType === "request_received") {
      emailPayload = {
        email: row.email,
        name: row.fullName,
        rollNumber: row.rollNumber,
        registrationNumber: row.registrationNumber,
        reason: null,
        setupToken: null,
        type: "request_received",
      };
    } else {
      if (!row.accountUserId || row.passwordChangeRequired !== false) {
        throw new ApiRequestError("Password setup must be completed before sending its confirmation.", 409);
      }
      emailPayload = {
        email: row.email,
        name: row.fullName,
        rollNumber: row.rollNumber,
        registrationNumber: row.registrationNumber,
        reason: null,
        setupToken: null,
        type: "password_setup_confirmation",
      };
    }
    await client.query(
      `UPDATE public.student_account_email_deliveries
       SET status = 'pending', attempt_count = attempt_count + 1,
           last_error = NULL, last_attempt_at = now(), updated_at = now()
       WHERE request_id = $1 AND notification_type = $2`,
      [row.id, input.notificationType],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new ApiRequestError("An account already uses this email or student record.", 409);
    }
    throw error;
  } finally {
    client.release();
  }

  if (!emailPayload) throw new Error("Student notification was not prepared.");
  try {
    if (input.notificationType === "approval") {
      await sendStudentApprovalEmail({
        email: emailPayload.email,
        name: emailPayload.name,
        rollNumber: emailPayload.rollNumber,
        registrationNumber: emailPayload.registrationNumber,
        loginId: emailPayload.loginId ?? emailPayload.rollNumber,
        temporaryPassword: emailPayload.temporaryPassword ?? "",
      });
    } else if (input.notificationType === "rejection") {
      await sendStudentRejectionEmail({
        email: emailPayload.email,
        name: emailPayload.name,
        rollNumber: emailPayload.rollNumber,
        registrationNumber: emailPayload.registrationNumber,
        reason: emailPayload.reason,
      });
    } else if (input.notificationType === "request_received") {
      await sendStudentRequestReceivedEmail({
        email: emailPayload.email,
        name: emailPayload.name,
        rollNumber: emailPayload.rollNumber,
        registrationNumber: emailPayload.registrationNumber,
      });
    } else {
      const { loginUrl } = getStudentPortalUrls();
      await sendPasswordSetupConfirmationEmail({
        email: emailPayload.email,
        name: emailPayload.name,
        loginUrl,
      });
    }
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE public.student_account_email_deliveries
         SET status = 'sent', last_error = NULL, sent_at = now(), updated_at = now()
         WHERE request_id = $1 AND notification_type = $2`,
        [input.requestId, input.notificationType],
      );
      if (input.notificationType === "approval") {
        await client.query(
          `UPDATE public.student_account_requests
           SET credentials_email_sent_at = now(), updated_at = now()
           WHERE id = $1`,
          [input.requestId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return { emailSent: true };
  } catch (error) {
    const safeMessage = error instanceof Error
      ? error.message.replace(/[\r\n]/g, " ").slice(0, 500)
      : "Unknown email delivery error.";
    console.error("Student account notification delivery failed.", safeMessage);
    try {
      await getPool().query(
        `UPDATE public.student_account_email_deliveries
         SET status = 'failed', last_error = $3, updated_at = now()
         WHERE request_id = $1 AND notification_type = $2`,
        [input.requestId, input.notificationType, safeMessage],
      );
    } catch (statusError) {
      console.error("Could not save failed student account email status.", statusError);
    }
    return { emailSent: false };
  }
}

async function approveStudentAccount(input: {
  requestId: string;
  instituteId: string;
  admin: { id: string; role: string };
}): Promise<string> {
  const client = await getPool().connect();
  let temporaryPassword = "";
  try {
    await client.query("BEGIN");
    const request = await client.query<{
      id: string;
      studentId: string;
      fullName: string;
      fatherName: string;
      rollNumber: string;
      registrationNumber: string;
      email: string;
      phone: string;
      status: string;
    }>(
      `SELECT id, student_id AS "studentId", full_name AS "fullName",
              father_name AS "fatherName", roll_number AS "rollNumber",
              registration_number AS "registrationNumber", email, phone, status
       FROM public.student_account_requests
       WHERE id = $1 AND institute_id = $2
       FOR UPDATE`,
      [input.requestId, input.instituteId],
    );
    const row = request.rows[0];
    if (!row) throw new ApiRequestError("Student account request was not found.", 404);
    if (row.status !== "pending") {
      throw new ApiRequestError("This student account request has already been reviewed.", 409);
    }

    const student = await client.query(
      `SELECT 1 FROM public.students
       WHERE id = $1 AND institute_id = $2 AND is_active = true
         AND approval_status = 'approved'
         AND lower(trim(roll_number)) = lower(trim($3))
         AND lower(trim(registration_number)) = lower(trim($4))
       FOR UPDATE`,
      [row.studentId, input.instituteId, row.rollNumber, row.registrationNumber],
    );
    if (!student.rowCount) {
      throw new ApiRequestError(
        "The linked student record is no longer active or no longer matches this request. Verify the student directory before approving.",
        409,
      );
    }

    const linkedAccounts = await client.query<{ id: string; role: string }>(
      `SELECT id, role FROM public.users
       WHERE student_id = $1
       ORDER BY created_at DESC
       FOR UPDATE`,
      [row.studentId],
    );
    if (linkedAccounts.rows.length > 1 || linkedAccounts.rows.some((account) => account.role !== "student")) {
      throw new ApiRequestError("This student record has conflicting linked accounts. Resolve them before approval.", 409);
    }
    const linkedAccountId = linkedAccounts.rows[0]?.id ?? null;
    let loginId = row.rollNumber;
    const loginIdConflict = await client.query(
      `SELECT 1 FROM public.users
       WHERE (lower(username) = lower($1) OR lower(email) = lower($1))
         AND ($2::uuid IS NULL OR id <> $2)
       LIMIT 1`,
      [loginId, linkedAccountId],
    );
    if (loginIdConflict.rowCount) {
      loginId = `${row.rollNumber.slice(0, 40)}-${row.studentId.slice(0, 8)}`;
      const fallbackConflict = await client.query(
        `SELECT 1 FROM public.users
         WHERE (lower(username) = lower($1) OR lower(email) = lower($1))
           AND ($2::uuid IS NULL OR id <> $2)
         LIMIT 1`,
        [loginId, linkedAccountId],
      );
      if (fallbackConflict.rowCount) {
        throw new ApiRequestError("Unable to create a unique Student Login ID. Contact the system operator.", 409);
      }
    }
    const existingEmail = await client.query(
      `SELECT 1 FROM public.users
       WHERE lower(trim(email)) = lower(trim($1))
         AND ($2::uuid IS NULL OR id <> $2)
       LIMIT 1`,
      [row.email, linkedAccountId],
    );
    if (existingEmail.rowCount) {
      throw new ApiRequestError("An account already uses this email. Review the student's email address first.", 409);
    }

    temporaryPassword = newInitialPassword();
    const passwordHash = await hash(temporaryPassword, 12);
    let accountUserId = linkedAccountId;
    if (linkedAccountId) {
      await client.query(
        `UPDATE public.users
         SET name = $2, email = $3, password_hash = $4, institute_id = $5,
             username = $6, is_active = true, password_change_required = true,
             token_version = token_version + 1, updated_at = now()
         WHERE id = $1`,
        [linkedAccountId, row.fullName, row.email, passwordHash, input.instituteId, loginId],
      );
      await client.query("DELETE FROM public.eduportal_sessions WHERE user_id = $1", [linkedAccountId]);
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.users
           (name, email, password_hash, role, institute_id, is_active,
            student_id, password_change_required, username)
         VALUES ($1,$2,$3,'student',$4,true,$5,true,$6)
         RETURNING id`,
        [row.fullName, row.email, passwordHash, input.instituteId, row.studentId, loginId],
      );
      accountUserId = created.rows[0]?.id ?? null;
    }
    if (!accountUserId) throw new Error("Student account was not created.");

    await client.query(
      `UPDATE public.students
       SET email = $2, student_phone = $3,
           father_name = COALESCE(NULLIF(trim(father_name), ''), $4),
           updated_at = now()
       WHERE id = $1 AND institute_id = $5`,
      [row.studentId, row.email, row.phone, row.fatherName, input.instituteId],
    );
    await client.query(
      `UPDATE public.student_account_requests
       SET status = 'approved', account_user_id = $3, reviewed_by = $4,
           reviewed_at = now(), credentials_email_sent_at = NULL,
           rejection_reason = NULL, updated_at = now()
       WHERE id = $1 AND institute_id = $2`,
      [row.id, input.instituteId, accountUserId, input.admin.id],
    );
    await client.query(
      `INSERT INTO public.student_account_email_deliveries
         (request_id, notification_type, recipient, status)
       VALUES ($1, 'approval', $2, 'pending')
       ON CONFLICT (request_id, notification_type)
       DO UPDATE SET recipient = EXCLUDED.recipient, status = 'pending',
                     last_error = NULL, sent_at = NULL, updated_at = now()`,
      [row.id, row.email],
    );
    await writeAudit(client, input.admin, "student_account_request.approved", "student_account_request", row.id, {
      instituteId: input.instituteId,
      studentId: row.studentId,
      accountUserId,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new ApiRequestError("An account already uses this email or student record.", 409);
    }
    throw error;
  } finally {
    client.release();
  }
  return temporaryPassword;
}

export async function PATCH(request: NextRequest) {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  try {
    assertSameOrigin(request);
    const admin = await requireRoles("SUPER_ADMIN");
    const body = await readJsonBody(request, 8_192);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Choose a request action.", 400);
    }
    const data = body as Record<string, unknown>;
    const kind = typeof data.kind === "string" ? data.kind : "";
    const id = typeof data.id === "string" ? data.id : "";
    const action = typeof data.action === "string" ? data.action : "";
    const requestedInstitute = typeof data.instituteId === "string" ? data.instituteId : "";
    if (!UUID.test(id) || !UUID.test(requestedInstitute)) {
      throw new ApiRequestError("Request and institute identifiers are invalid.", 400);
    }
    const instituteId = await resolveInstituteId(admin, requestedInstitute);

    if (kind === "student" && action === "approve") {
      const temporaryPassword = await approveStudentAccount({ requestId: id, instituteId, admin });
      const result = await deliverCredentials({
        requestId: id,
        instituteId,
        notificationType: "approval",
        temporaryPassword,
      });
      return NextResponse.json({
        success: true,
        emailSent: result.emailSent,
        message: result.emailSent
          ? "Student account was approved. Temporary login credentials were sent to the registered student email."
          : "Student account was approved, but the email failed. Check email settings and retry delivery.",
      });
    }

    if (kind === "student" && action === "reject") {
      const rejectionReason = typeof data.rejectionReason === "string"
        ? data.rejectionReason.trim().slice(0, 2_000)
        : "";
      client = await getPool().connect();
      await client.query("BEGIN");
      transactionOpen = true;
      const updated = await client.query<{ email: string }>(
        `UPDATE public.student_account_requests
         SET status = 'rejected', rejection_reason = NULLIF($4, ''),
             reviewed_by = $3, reviewed_at = now(), updated_at = now()
         WHERE id = $1 AND institute_id = $2 AND status = 'pending'
         RETURNING email`,
        [id, instituteId, admin.id, rejectionReason],
      );
      if (!updated.rowCount) throw new ApiRequestError("Pending student account request was not found.", 404);
      await client.query(
        `INSERT INTO public.student_account_email_deliveries
           (request_id, notification_type, recipient, status)
         VALUES ($1, 'rejection', $2, 'pending')
         ON CONFLICT (request_id, notification_type)
         DO UPDATE SET recipient = EXCLUDED.recipient, status = 'pending',
                       last_error = NULL, sent_at = NULL, updated_at = now()`,
        [id, updated.rows[0]!.email],
      );
      await writeAudit(client, admin, "student_account_request.rejected", "student_account_request", id, {
        instituteId,
        rejectionReason: rejectionReason || null,
      });
      await client.query("COMMIT");
      transactionOpen = false;
      const emailResult = await deliverCredentials({ requestId: id, instituteId, notificationType: "rejection" });
      return NextResponse.json({
        success: true,
        emailSent: emailResult.emailSent,
        message: emailResult.emailSent
          ? "Request rejected and the student was notified."
          : "Request rejected, but the notification email failed. Check email settings and retry delivery.",
      });
    }

    if (kind === "student" && action === "retry_email") {
      const validNotificationTypes = new Set([
        "request_received",
        "approval",
        "rejection",
        "password_setup_confirmation",
      ]);
      const notificationType = typeof data.notificationType === "string" &&
        validNotificationTypes.has(data.notificationType)
        ? data.notificationType as "request_received" | "approval" | "rejection" | "password_setup_confirmation"
        : "approval";
      const result = await deliverCredentials({ requestId: id, instituteId, notificationType });
      await getPool().query(
        `INSERT INTO public.admin_audit_logs
           (actor_user_id, actor_role, action, target_type, target_id, after_value)
         VALUES ($1, $2, 'student_account_email.retried',
                 'student_account_request', $3, $4::jsonb)`,
        [admin.id, admin.role.toLowerCase(), id, JSON.stringify({ notificationType, emailSent: result.emailSent })],
      );
      return NextResponse.json({
        success: true,
        emailSent: result.emailSent,
        message: result.emailSent ? "Email delivery completed." : "Email delivery failed. Check SMTP configuration and retry.",
      });
    }

    if (kind === "application" && APPLICATION_STATUSES.has(action)) {
      client = await getPool().connect();
      await client.query("BEGIN");
      transactionOpen = true;
      const updated = await client.query(
        `UPDATE public.institute_admission_applications
         SET status = $3
         WHERE id = $1 AND institute_id = $2
         RETURNING id`,
        [id, instituteId, action],
      );
      if (!updated.rowCount) throw new ApiRequestError("Admission application was not found.", 404);
      await writeAudit(client, admin, "admission_application.status_changed", "admission_application", id, {
        instituteId,
        status: action,
      });
      await client.query("COMMIT");
      transactionOpen = false;
      return NextResponse.json({ success: true });
    }

    throw new ApiRequestError("Choose a valid request action.", 400);
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) return jsonError(error.message, error.status);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "42P01" || error.code === "42703")
    ) {
      console.error("Pending request schema is missing on the configured database.", error);
      return jsonError(
        "Student request storage is not installed on this database. Production was not changed. Set up and verify a separate staging database before applying the required migrations.",
        503,
      );
    }
    console.error("Pending request update failed.", error);
    return jsonError("Unable to update this request.", 500);
  } finally {
    client?.release();
  }
}
