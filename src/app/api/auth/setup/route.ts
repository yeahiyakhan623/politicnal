import { hash } from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/origin";
import { consumeAuthAttempt, hashAuthRateKey, MAX_AUTH_ATTEMPTS } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, createSession } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { ApiRequestError, readJsonBody } from "@/lib/api/http";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 4096;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return jsonError("Request origin could not be verified.", 403);
  }
  if (!process.env.DATABASE_URL) return jsonError("Database is not configured.", 503);

  let body: unknown;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof ApiRequestError) return jsonError(error.message, error.status);
    return jsonError("Request body must be valid JSON.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Name, email and password are required.", 400);
  }
  const data = body as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";
  if (name.length < 2 || name.length > 160) return jsonError("Name must be between 2 and 160 characters.", 400);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return jsonError("Enter a valid email address.", 400);
  if (password.length < 8 || password.length > 128) {
    return jsonError("Password must be between 8 and 128 characters.", 400);
  }

  const forwardedIp = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const clientIp = forwardedIp.slice(0, 100);
  const rateKey = hashAuthRateKey(clientIp, `setup:${email}`);
  const ipRateKey = hashAuthRateKey(clientIp, "setup:*");

  try {
    const attempts = await consumeAuthAttempt(rateKey);
    const ipAttempts = await consumeAuthAttempt(ipRateKey);
    if (attempts > MAX_AUTH_ATTEMPTS || ipAttempts > MAX_AUTH_ATTEMPTS * 4) {
      return jsonError("Too many setup attempts. Try again in 15 minutes.", 429);
    }

    const passwordHash = await hash(password, 12);
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('eduportal-single-super-admin-setup'))");
      const existing = await client.query(
        `SELECT EXISTS (SELECT 1 FROM public.users)
           OR EXISTS (SELECT 1 FROM public.institutes)
           OR EXISTS (SELECT 1 FROM public.students)
           OR EXISTS (SELECT 1 FROM public.student_account_requests) AS initialized`,
      );
      if (existing.rows[0]?.initialized) {
        await client.query("ROLLBACK");
        return jsonError("Initial setup is closed because system records already exist. Contact the system operator.", 409);
      }

      const created = await client.query<{
        id: string;
        name: string;
        email: string;
        role: string;
      }>(
        `INSERT INTO public.users (name, email, password_hash, role, institute_id, is_active)
         VALUES ($1, $2, $3, 'super_admin', NULL, true)
         RETURNING id, name, email, role`,
        [name, email, passwordHash],
      );
      await client.query(
        `INSERT INTO public.admin_audit_logs
          (actor_user_id, actor_role, action, target_type, target_id, after_value)
         VALUES ($1, 'system', 'auth.super_admin_bootstrapped', 'user', $2, $3::jsonb)`,
        [created.rows[0].id, created.rows[0].id, JSON.stringify({ email })],
      );
      const session = await createSession(created.rows[0].id, client);
      await client.query("COMMIT");

      const response = NextResponse.json({
        user: {
          id: created.rows[0].id,
          name: created.rows[0].name,
          email: created.rows[0].email,
          role: created.rows[0].role,
          instituteId: null,
        },
      }, { status: 201 });
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
      await client.query("ROLLBACK").catch(() => undefined);
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return jsonError("A Super Admin account or email already exists. Sign in with the existing account.", 409);
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Super Admin setup failed.", error);
    return jsonError("Setup service is temporarily unavailable.", 503);
  }
}
