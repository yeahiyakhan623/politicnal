import { compare } from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/origin";
import { consumeAuthAttempt, hashAuthRateKey, MAX_AUTH_ATTEMPTS } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, createSession } from "@/lib/auth/session";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;
const DUMMY_PASSWORD_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.2K/4U7.DgVh0EhwC.zUu93W0/.fM5uW";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function readBoundedBody(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("Request body is too large.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return jsonError("Request origin could not be verified.", 403);
  }

  if (!process.env.DATABASE_URL) {
    return jsonError("Database is not configured. Set DATABASE_URL and run the database migration.", 503);
  }
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return jsonError("Content-Type must be application/json.", 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return jsonError("Request body is too large.", 413);

  let body: unknown;
  try {
    body = JSON.parse(await readBoundedBody(request));
  } catch (error) {
    if (error instanceof RangeError) return jsonError(error.message, 413);
    return jsonError("Request body must be valid JSON.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Email, Student Login ID and password are required.", 400);
  }

  const data = body as Record<string, unknown>;
  const identifier = typeof data.identifier === "string"
    ? data.identifier.trim().toLowerCase()
    : typeof data.email === "string"
      ? data.email.trim().toLowerCase()
      : "";
  const password = typeof data.password === "string" ? data.password : "";
  if (!identifier || identifier.length > 254 || password.length < 1 || password.length > 128) {
    return jsonError("Email or password is incorrect.", 400);
  }

  const forwardedIp = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const clientIp = forwardedIp.slice(0, 100);
  const rateKey = hashAuthRateKey(clientIp, identifier);
  const ipRateKey = hashAuthRateKey(clientIp, "*");

  try {
    const attemptCount = await consumeAuthAttempt(rateKey);
    const ipAttemptCount = await consumeAuthAttempt(ipRateKey);
    if (attemptCount > MAX_AUTH_ATTEMPTS || ipAttemptCount > MAX_AUTH_ATTEMPTS * 4) {
      return jsonError("Too many sign-in attempts. Try again in 15 minutes.", 429);
    }

    const userResult = await getPool().query<{
      id: string;
      name: string;
      email: string;
      role: string;
      institute_id: string | null;
      is_active: boolean;
      password_hash: string;
    }>(
      `SELECT id, name, email, role, institute_id, is_active, password_hash
       FROM public.users
       WHERE lower(email) = $1 OR lower(username) = $1
       ORDER BY CASE WHEN lower(email) = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [identifier],
    );
    const user = userResult.rows[0];
    const passwordMatches = await compare(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.is_active || !passwordMatches) {
      return jsonError("Email or password is incorrect.", 401);
    }

    const session = await createSession(user.id);
    await getPool().query(
      "DELETE FROM public.eduportal_login_attempts WHERE key_hash = ANY($1::char(64)[])",
      [[rateKey, ipRateKey]],
    );

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        instituteId: user.institute_id,
      },
    });
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
    console.error("Authentication request failed.", error);
    return jsonError("Authentication service is temporarily unavailable.", 503);
  }
}
