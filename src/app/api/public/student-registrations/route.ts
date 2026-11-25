import { NextResponse, type NextRequest } from "next/server";
import { ApiRequestError, readJsonBody } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { consumeAuthAttempt, hashAuthRateKey, MAX_AUTH_ATTEMPTS } from "@/lib/auth/rate-limit";
import { getPool } from "@/lib/db";
import { sendStudentRequestReceivedEmail } from "@/lib/email/service";
import { studentNameMatches } from "@/lib/students/registration-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function deliverRequestReceipt(input: {
  requestId: string;
  email: string;
  name: string;
  rollNumber: string;
  registrationNumber: string;
}) {
  let deliveryClaimed = false;
  try {
    const claimed = await getPool().query(
      `UPDATE public.student_account_email_deliveries
       SET status = 'pending', attempt_count = attempt_count + 1,
           last_attempt_at = now(), last_error = NULL, updated_at = now()
       WHERE request_id = $1 AND notification_type = 'request_received'
         AND status IN ('pending', 'failed')
         AND (last_attempt_at IS NULL OR last_attempt_at < now() - interval '2 minutes')
       RETURNING id`,
      [input.requestId],
    );
    if (!claimed.rowCount) return false;
    deliveryClaimed = true;

    await sendStudentRequestReceivedEmail({
      email: input.email,
      name: input.name,
      rollNumber: input.rollNumber,
      registrationNumber: input.registrationNumber,
    });
    await getPool().query(
      `UPDATE public.student_account_email_deliveries
       SET status = 'sent', sent_at = now(), last_error = NULL, updated_at = now()
       WHERE request_id = $1 AND notification_type = 'request_received'`,
      [input.requestId],
    );
    return true;
  } catch (error) {
    const safeMessage = error instanceof Error
      ? error.message.replace(/[\r\n]/g, " ").slice(0, 500)
      : "Unknown email delivery error.";
    console.error("Student request receipt email delivery failed.", safeMessage);
    if (deliveryClaimed) {
      try {
        await getPool().query(
          `UPDATE public.student_account_email_deliveries
           SET status = 'failed', last_error = $2, updated_at = now()
           WHERE request_id = $1 AND notification_type = 'request_received'`,
          [input.requestId, safeMessage],
        );
      } catch (statusError) {
        console.error("Could not save failed student request email status.", statusError);
      }
    }
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request, 8_192);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Complete the student registration form.", 400);
    }

    const data = body as Record<string, unknown>;
    const instituteId = typeof data.instituteId === "string" ? data.instituteId : "";
    const fullName = typeof data.fullName === "string" ? data.fullName.trim() : "";
    const fatherName = typeof data.fatherName === "string" ? data.fatherName.trim() : "";
    const roll = typeof data.roll === "string" ? data.roll.trim() : "";
    const registration = typeof data.registration === "string" ? data.registration.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const phone = typeof data.phone === "string" ? data.phone.trim() : "";

    if (!UUID.test(instituteId)) throw new ApiRequestError("Select your institute.", 400);
    if (fullName.length < 2 || fullName.length > 160) throw new ApiRequestError("Enter your full name.", 400);
    if (fatherName.length < 2 || fatherName.length > 160) throw new ApiRequestError("Enter your father's name.", 400);
    if (!roll || roll.length > 40 || !registration || registration.length > 60) {
      throw new ApiRequestError("Enter your roll and registration numbers.", 400);
    }
    if (email.length > 254 || !EMAIL.test(email)) throw new ApiRequestError("Enter a valid email address.", 400);
    if (phone.length < 6 || phone.length > 30) throw new ApiRequestError("Enter a valid phone number.", 400);

    const forwardedIp = request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rateKey = hashAuthRateKey(forwardedIp.slice(0, 100), "student-account-request");
    if (await consumeAuthAttempt(rateKey) > MAX_AUTH_ATTEMPTS) {
      throw new ApiRequestError("Too many account requests from this network. Try again later.", 429);
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
        [`student-registration-email:${email}`],
      );

      const studentResult = await client.query<{
        id: string;
        fullName: string | null;
        fatherName: string | null;
      }>(
        `SELECT s.id, s.full_name AS "fullName", s.father_name AS "fatherName"
         FROM public.students s
         JOIN public.institutes i ON i.id = s.institute_id AND i.review_status = 'approved'
         WHERE s.institute_id = $1 AND s.is_active = true
           AND s.approval_status = 'approved'
           AND lower(trim(s.roll_number)) = lower($2)
           AND lower(trim(s.registration_number)) = lower($3)
         LIMIT 2
         FOR UPDATE OF s`,
        [instituteId, roll, registration],
      );
      const student = studentResult.rows[0];
      if (studentResult.rows.length !== 1 || !student) {
        throw new ApiRequestError(
          "We could not verify that roll and registration number. Confirm them with your institute before registering.",
          400,
        );
      }
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
        [`student-registration-student:${student.id}`],
      );
      if (
        !studentNameMatches(student.fullName, fullName) ||
        (student.fatherName && !studentNameMatches(student.fatherName, fatherName))
      ) {
        throw new ApiRequestError(
          "The name details do not match a complete institute record. Contact the institute administrator to verify or complete your student directory record.",
          400,
        );
      }

      const linkedStudentAccount = await client.query(
        `SELECT 1 FROM public.users
         WHERE student_id = $1 AND role = 'student' AND is_active = true
         LIMIT 1`,
        [student.id],
      );
      if (linkedStudentAccount.rowCount) {
        throw new ApiRequestError(
          "A student portal account already exists for this student record. Sign in or contact the institute administrator.",
          409,
        );
      }

      const existingAccount = await client.query(
        `SELECT 1
         FROM public.users account
         JOIN public.students active_student
           ON active_student.id = account.student_id
         WHERE lower(trim(account.email)) = $1
           AND account.role = 'student'
           AND account.is_active = true
           AND active_student.is_active = true
           AND active_student.approval_status = 'approved'
         LIMIT 1`,
        [email],
      );
      if (existingAccount.rowCount) {
        throw new ApiRequestError(
          "An active student account already exists for this email. Sign in or contact the institute administrator.",
          409,
        );
      }

      const studentRequest = (await client.query<{ id: string }>(
        `SELECT id FROM public.student_account_requests
         WHERE institute_id = $1 AND student_id = $2 AND status = 'pending'
         FOR UPDATE`,
        [instituteId, student.id],
      )).rows[0];
      let updated = false;
      let requestId: string | undefined;
      if (studentRequest) {
        const savedRequest = await client.query<{ id: string }>(
          `UPDATE public.student_account_requests
           SET full_name = $2, father_name = $3, roll_number = $4,
               registration_number = $5, email = $6, phone = $7, updated_at = now()
           WHERE id = $1
           RETURNING id`,
          [studentRequest.id, fullName, fatherName, roll, registration, email, phone],
        );
        requestId = savedRequest.rows[0]?.id;
        updated = true;
      } else {
        const savedRequest = await client.query<{ id: string }>(
          `INSERT INTO public.student_account_requests
             (institute_id, student_id, full_name, father_name, roll_number,
              registration_number, email, phone)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING id`,
          [instituteId, student.id, fullName, fatherName, roll, registration, email, phone],
        );
        requestId = savedRequest.rows[0]?.id;
      }

      if (!requestId) throw new Error("Student account request was not persisted.");
      if (!updated) {
        await client.query(
          `INSERT INTO public.student_account_email_deliveries
             (request_id, notification_type, recipient, status)
           VALUES ($1, 'request_received', $2, 'pending')
           ON CONFLICT (request_id, notification_type) DO NOTHING`,
          [requestId, email],
        );
      }
      await client.query("COMMIT");
      const emailSent = !updated
        ? await deliverRequestReceipt({
          requestId,
          email,
          name: fullName,
          rollNumber: roll,
          registrationNumber: registration,
        })
        : null;
      return NextResponse.json(
        {
          success: true,
          submitted: true,
          updated,
          requestId,
          emailSent,
          message: updated
            ? "Account request updated successfully."
            : emailSent
              ? "Account request submitted successfully. A receipt was emailed."
              : "Account request was saved, but its receipt email could not be sent. The institute can retry it.",
        },
        { status: updated ? 200 : 201, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ApiRequestError) throw error;
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new ApiRequestError(
          "A request for this student or email was submitted at the same time. Refresh the page and try again.",
          409,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof ApiRequestError) return errorResponse(error.message, error.status);
    if (error instanceof Error && error.message.toLowerCase().includes("same-origin request")) {
      return errorResponse("Request origin could not be verified.", 403);
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "42P01" || error.code === "42703")
    ) {
      console.error("Student account request schema is missing on the configured database.", error);
      return errorResponse(
        "Student account request storage is not installed on this database. Production was not changed. Set up and verify a separate staging database before applying the required migrations.",
        503,
      );
    }
    console.error("Student account registration failed.", error);
    return errorResponse("Unable to submit the registration request right now.", 500);
  }
}
