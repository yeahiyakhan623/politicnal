import { hash } from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, readJsonBody } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { consumeAuthAttempt, hashAuthRateKey, MAX_AUTH_ATTEMPTS } from "@/lib/auth/rate-limit";
import { hashPasswordResetToken } from "@/lib/auth/password-reset";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request, 4_096);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Password reset details are required.", 400);
    }
    const data = body as Record<string, unknown>;
    const token = typeof data.token === "string" ? data.token : "";
    const password = typeof data.password === "string" ? data.password : "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new ApiRequestError("This password reset link is invalid or expired.", 400);
    }
    if (password.length < 10 || password.length > 128) {
      throw new ApiRequestError("Choose a password with 10 to 128 characters.", 400);
    }

    const forwardedIp = request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const tokenHash = hashPasswordResetToken(token);
    const rateKey = hashAuthRateKey(forwardedIp.slice(0, 100), `password-reset:${tokenHash}`);
    if (await consumeAuthAttempt(rateKey) > MAX_AUTH_ATTEMPTS) {
      throw new ApiRequestError("Too many password reset attempts. Try again later.", 429);
    }

    const passwordHash = await hash(password, 12);
    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const tokenResult = await client.query<{ id: string; userId: string }>(
      `SELECT reset_token.id, reset_token.user_id AS "userId"
       FROM public.password_reset_tokens reset_token
       JOIN public.users account ON account.id = reset_token.user_id
       WHERE reset_token.token_hash = $1
         AND reset_token.used_at IS NULL
         AND reset_token.expires_at > now()
         AND account.is_active = true
       FOR UPDATE OF reset_token, account`,
      [tokenHash],
    );
    const resetToken = tokenResult.rows[0];
    if (!resetToken) {
      throw new ApiRequestError("This password reset link is invalid, expired, or already used.", 410);
    }

    await client.query(
      `UPDATE public.users
       SET password_hash = $2, password_change_required = false,
           token_version = token_version + 1, updated_at = now()
       WHERE id = $1 AND is_active = true`,
      [resetToken.userId, passwordHash],
    );
    await client.query(
      `UPDATE public.password_reset_tokens
       SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL`,
      [resetToken.userId],
    );
    await client.query(
      "DELETE FROM public.eduportal_sessions WHERE user_id = $1",
      [resetToken.userId],
    );
    await client.query(
      `INSERT INTO public.password_management_audit
         (institute_id, actor_user_id, event_type, outcome)
       SELECT institute_id, id, 'self_service_reset', 'success'
       FROM public.users WHERE id = $1`,
      [resetToken.userId],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    return NextResponse.json(
      { success: true, message: "Password reset. Sign in with your new password." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof ApiRequestError) return jsonError(error.message, error.status);
    if (error instanceof Error && error.message.toLowerCase().includes("same-origin request")) {
      return jsonError("Request origin could not be verified.", 403);
    }
    console.error("Password reset failed.");
    return jsonError("Unable to reset your password right now.", 503);
  } finally {
    client?.release();
  }
}
