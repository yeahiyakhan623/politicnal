import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { readJsonBody, ApiRequestError } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { consumeAuthAttempt, hashAuthRateKey, MAX_AUTH_ATTEMPTS } from "@/lib/auth/rate-limit";
import {
  createPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_HOURS,
} from "@/lib/auth/password-reset";
import { getPool } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_RESPONSE = {
  success: true,
  message: "If an active account uses that email, password reset instructions will be sent.",
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  let reset: { id: string; email: string; name: string; token: string; tokenHash: string } | null = null;
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request, 4_096);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Enter the email address for your account.", 400);
    }

    const data = body as Record<string, unknown>;
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (email.length > 254 || !EMAIL.test(email)) {
      throw new ApiRequestError("Enter a valid email address.", 400);
    }

    const forwardedIp = request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const clientIp = forwardedIp.slice(0, 100);
    const emailKey = hashAuthRateKey(clientIp, `password-reset:${email}`);
    const ipKey = hashAuthRateKey(clientIp, "password-reset:*");
    const [emailAttempts, ipAttempts] = await Promise.all([
      consumeAuthAttempt(emailKey),
      consumeAuthAttempt(ipKey),
    ]);
    if (emailAttempts > MAX_AUTH_ATTEMPTS || ipAttempts > MAX_AUTH_ATTEMPTS * 4) {
      return jsonError("Too many password reset requests. Try again later.", 429);
    }

    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const user = await client.query<{ id: string; email: string; name: string }>(
      `SELECT id, email, name
       FROM public.users
       WHERE lower(trim(email)) = $1 AND is_active = true
       LIMIT 1
       FOR UPDATE`,
      [email],
    );
    const account = user.rows[0];
    if (account) {
      const { token, tokenHash } = createPasswordResetToken();
      await client.query(
        `UPDATE public.password_reset_tokens
         SET used_at = COALESCE(used_at, now())
         WHERE user_id = $1 AND used_at IS NULL`,
        [account.id],
      );
      await client.query(
        `INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + ($3 * interval '1 hour'))`,
        [account.id, tokenHash, PASSWORD_RESET_TOKEN_TTL_HOURS],
      );
      reset = { ...account, token, tokenHash };
    }
    await client.query("COMMIT");
    transactionOpen = false;

    if (reset) {
      client.release();
      client = undefined;
      let emailSent = false;
      try {
        await sendPasswordResetEmail({ email: reset.email, name: reset.name, token: reset.token });
        emailSent = true;
      } catch {
        console.error("Password reset email delivery failed.");
      }
      try {
        await getPool().query(
          `WITH invalidated AS (
             UPDATE public.password_reset_tokens
             SET used_at = now()
             WHERE token_hash = $1 AND used_at IS NULL AND $2::boolean = false
             RETURNING user_id
           )
           INSERT INTO public.password_management_audit
             (institute_id, actor_user_id, event_type, outcome)
           SELECT institute_id, id, 'forgot_password', $3
           FROM public.users WHERE id = $4`,
          [reset.tokenHash, emailSent, emailSent ? "success" : "failure", reset.id],
        );
      } catch {
        console.error("Password reset audit update failed.");
      }
    }

    return NextResponse.json(GENERIC_RESPONSE, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof ApiRequestError) return jsonError(error.message, error.status);
    if (error instanceof Error && error.message.toLowerCase().includes("same-origin request")) {
      return jsonError("Request origin could not be verified.", 403);
    }
    console.error("Password reset request failed.");
    return jsonError("Password reset service is temporarily unavailable.", 503);
  } finally {
    client?.release();
  }
}
