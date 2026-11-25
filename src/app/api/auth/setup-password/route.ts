import { hash } from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, apiError, readJsonBody } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { hashAuthRateKey, consumeAuthAttempt, MAX_AUTH_ATTEMPTS } from "@/lib/auth/rate-limit";
import { hashPasswordSetupToken } from "@/lib/auth/password-setup";
import { SESSION_COOKIE, createSession } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { getStudentPortalUrls } from "@/lib/email/config";
import { sendPasswordSetupConfirmationEmail } from "@/lib/email/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const clientIp = (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  ).slice(0, 100);
  let client: PoolClient | undefined;
  let transactionOpen = false;
  let confirmation: { requestId: string; email: string; name: string } | null = null;
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request, 4_096);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Password setup details are required.", 400);
    }
    const data = body as Record<string, unknown>;
    const token = typeof data.token === "string" ? data.token : "";
    const password = typeof data.password === "string" ? data.password : "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new ApiRequestError("This password setup link is invalid or expired.", 400);
    }
    if (password.length < 10 || password.length > 128) {
      throw new ApiRequestError("Choose a password with 10 to 128 characters.", 400);
    }

    const tokenHash = hashPasswordSetupToken(token);
    const keyHash = hashAuthRateKey(clientIp, `password-setup:${tokenHash}`);
    if (await consumeAuthAttempt(keyHash) > MAX_AUTH_ATTEMPTS) {
      throw new ApiRequestError("Too many password setup attempts. Try again later.", 429);
    }
    const passwordHash = await hash(password, 12);

    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const tokenRow = await client.query<{ userId: string }>(
      `SELECT setup_token.user_id AS "userId"
       FROM public.student_password_setup_tokens setup_token
       JOIN public.users account ON account.id = setup_token.user_id
       WHERE setup_token.token_hash = $1
         AND setup_token.used_at IS NULL
         AND setup_token.expires_at > now()
         AND account.role = 'student'
         AND account.is_active = true
         AND account.password_change_required = true
       FOR UPDATE OF setup_token, account`,
      [tokenHash],
    );
    const userId = tokenRow.rows[0]?.userId;
    if (!userId) throw new ApiRequestError("This password setup link is invalid, expired, or already used.", 410);

    const requestRow = await client.query<{ id: string; email: string; fullName: string }>(
      `SELECT id, email, full_name AS "fullName"
       FROM public.student_account_requests
       WHERE account_user_id = $1 AND status = 'approved'
       ORDER BY reviewed_at DESC NULLS LAST, requested_at DESC
       LIMIT 1
       FOR UPDATE`,
      [userId],
    );
    const approvedRequest = requestRow.rows[0];

    await client.query(
      `UPDATE public.users
       SET password_hash = $2, password_change_required = false,
           token_version = token_version + 1, updated_at = now()
       WHERE id = $1 AND role = 'student' AND is_active = true`,
      [userId, passwordHash],
    );
    await client.query(
      `UPDATE public.student_password_setup_tokens
       SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    if (approvedRequest) {
      await client.query(
        `INSERT INTO public.student_account_email_deliveries
           (request_id, notification_type, recipient, status)
         VALUES ($1, 'password_setup_confirmation', $2, 'pending')
         ON CONFLICT (request_id, notification_type)
         DO UPDATE SET recipient = EXCLUDED.recipient, status = 'pending',
                       last_error = NULL, sent_at = NULL, updated_at = now()`,
        [approvedRequest.id, approvedRequest.email],
      );
      await client.query(
        `UPDATE public.student_account_email_deliveries
         SET status = 'pending', attempt_count = attempt_count + 1,
             last_attempt_at = now(), last_error = NULL, updated_at = now()
         WHERE request_id = $1 AND notification_type = 'password_setup_confirmation'`,
        [approvedRequest.id],
      );
      confirmation = {
        requestId: approvedRequest.id,
        email: approvedRequest.email,
        name: approvedRequest.fullName,
      };
    }
    const session = await createSession(userId, client);
    await client.query("COMMIT");
    transactionOpen = false;

    let confirmationEmailSent: boolean | null = null;
    if (confirmation) {
      try {
        const { loginUrl } = getStudentPortalUrls();
        await sendPasswordSetupConfirmationEmail({
          email: confirmation.email,
          name: confirmation.name,
          loginUrl,
        });
        await getPool().query(
          `UPDATE public.student_account_email_deliveries
           SET status = 'sent', sent_at = now(), last_error = NULL, updated_at = now()
           WHERE request_id = $1 AND notification_type = 'password_setup_confirmation'`,
          [confirmation.requestId],
        );
        confirmationEmailSent = true;
      } catch (error) {
        const safeMessage = error instanceof Error
          ? error.message.replace(/[\r\n]/g, " ").slice(0, 500)
          : "Unknown email delivery error.";
        console.error("Student password confirmation email delivery failed.", safeMessage);
        try {
          await getPool().query(
            `UPDATE public.student_account_email_deliveries
             SET status = 'failed', last_error = $2, updated_at = now()
             WHERE request_id = $1 AND notification_type = 'password_setup_confirmation'`,
            [confirmation.requestId, safeMessage],
          );
        } catch (statusError) {
          console.error("Could not save failed password confirmation email status.", statusError);
        }
        confirmationEmailSent = false;
      }
    }

    const response = NextResponse.json({ success: true, confirmationEmailSent });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: session.expiresAt,
      priority: "high",
    });
    return response;
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Student password setup failed.", error);
    return NextResponse.json({ error: "Unable to set your password right now." }, { status: 503 });
  } finally {
    client?.release();
  }
}
