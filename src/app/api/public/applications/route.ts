import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, apiError, readJsonBody } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { consumeAuthAttempt, hashAuthRateKey, MAX_AUTH_ATTEMPTS } from "@/lib/auth/rate-limit";
import { getPool } from "@/lib/db";
import { decryptApplicantData, encryptApplicantData } from "@/lib/applications/encryption";

export const runtime = "nodejs";

const COOKIE_NAME = "eduportal_applicant_session";
const SESSION_DAYS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DUMMY_PASSWORD_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.2K/4U7.DgVh0EhwC.zUu93W0/.fM5uW";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function emailValue(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiRequestError("Enter a valid email address.", 400);
  }
  return email;
}

function passwordValue(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new ApiRequestError("Password must be between 8 and 128 characters.", 400);
  }
  return value;
}

function rateIdentities(request: NextRequest, email: string) {
  const forwardedIp = request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ip = forwardedIp.slice(0, 100);
  return {
    identity: hashAuthRateKey(ip, email),
    address: hashAuthRateKey(ip, "*"),
  };
}

async function createApplicantSession(client: PoolClient, accountId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await client.query(
    `INSERT INTO public.admission_applicant_sessions (account_id, token_hash, expires_at)
     VALUES ($1,$2,$3)`,
    [accountId, hashToken(token), expiresAt],
  );
  return { token, expiresAt };
}

function setApplicantCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

async function applicantAccountId() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || token.length > 128) return null;
  const result = await getPool().query<{ id: string }>(
    `SELECT account.id
     FROM public.admission_applicant_sessions session
     JOIN public.admission_applicant_accounts account ON account.id = session.account_id
     WHERE session.token_hash = $1 AND session.revoked_at IS NULL
       AND session.expires_at > now()
     LIMIT 1`,
    [hashToken(token)],
  );
  return result.rows[0]?.id ?? null;
}

export async function GET() {
  try {
    const accountId = await applicantAccountId();
    if (!accountId) return NextResponse.json({ authenticated: false, applications: [] });
    const result = await getPool().query<{
      trackingId: string;
      status: string;
      submittedAt: Date | string;
      title: string;
      noticeDate: string | null;
      applicantDataEncrypted: Buffer;
    }>(
      `SELECT application.tracking_id AS "trackingId", application.status,
              application.submitted_at AS "submittedAt", notice.title,
              to_char(notice.application_deadline, 'YYYY-MM-DD') AS "noticeDate",
              application.applicant_data_encrypted AS "applicantDataEncrypted"
       FROM public.institute_admission_applications application
       JOIN public.notices notice
         ON notice.id = application.notice_id AND notice.institute_id = application.institute_id
       WHERE application.applicant_account_id = $1
       ORDER BY application.submitted_at DESC`,
      [accountId],
    );
    const applications = result.rows.map((row) => {
      const data = decryptApplicantData<{ fullName: string }>(row.applicantDataEncrypted);
      return {
        trackingId: row.trackingId,
        status: row.status,
        submittedAt: new Date(row.submittedAt).toISOString(),
        title: row.title,
        fullName: data.fullName,
      };
    });
    return NextResponse.json({ authenticated: true, applications }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiError(error);
    if (response) return response;
    console.error("Applicant status request failed.", error);
    return jsonError("Unable to load application status.", 500);
  }
}

export async function POST(request: NextRequest) {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  let sessionToken: string | undefined;
  let sessionExpiry: Date | undefined;
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request, 32_768);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Application action is required.", 400);
    }
    const data = body as Record<string, unknown>;
    const action = data.action;
    if (action === "logout") {
      const token = (await cookies()).get(COOKIE_NAME)?.value;
      if (token) {
        await getPool().query(
          "UPDATE public.admission_applicant_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
          [hashToken(token)],
        );
      }
      const response = NextResponse.json({ success: true });
      response.cookies.set(COOKIE_NAME, "", {
        httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "strict", path: "/", expires: new Date(0),
      });
      return response;
    }

    const email = emailValue(data.email);
    const password = passwordValue(data.password);
    const rateKeys = rateIdentities(request, email);
    const [identityAttempts, addressAttempts] = await Promise.all([
      consumeAuthAttempt(rateKeys.identity),
      consumeAuthAttempt(rateKeys.address),
    ]);
    if (identityAttempts > MAX_AUTH_ATTEMPTS || addressAttempts > MAX_AUTH_ATTEMPTS * 4) {
      return jsonError("Too many attempts. Try again in 15 minutes.", 429);
    }

    if (action === "login") {
      const account = await getPool().query<{ id: string; passwordHash: string }>(
        `SELECT id, password_hash AS "passwordHash"
         FROM public.admission_applicant_accounts
         WHERE lower(email) = $1 LIMIT 1`,
        [email],
      );
      const row = account.rows[0];
      const matches = await compare(password, row?.passwordHash ?? DUMMY_PASSWORD_HASH);
      if (!row || !matches) return jsonError("Email or password is incorrect.", 401);
      client = await getPool().connect();
      await client.query("BEGIN");
      transactionOpen = true;
      const session = await createApplicantSession(client, row.id);
      await client.query("COMMIT");
      transactionOpen = false;
      sessionToken = session.token;
      sessionExpiry = session.expiresAt;
      await getPool().query("DELETE FROM public.eduportal_login_attempts WHERE key_hash = ANY($1::char(64)[])", [[rateKeys.identity, rateKeys.address]]);
      const response = NextResponse.json({ authenticated: true });
      setApplicantCookie(response, sessionToken, sessionExpiry);
      return response;
    }

    if (action !== "apply") throw new ApiRequestError("Select a valid application action.", 400);
    if (!process.env.ADMISSION_DATA_ENCRYPTION_KEY) {
      return jsonError("Application storage is not configured. Contact the institute administrator.", 503);
    }
    const noticeId = typeof data.noticeId === "string" ? data.noticeId : "";
    if (!UUID.test(noticeId)) throw new ApiRequestError("Select a valid admission circular.", 400);
    const fullName = typeof data.fullName === "string" ? data.fullName.trim() : "";
    if (fullName.length < 2 || fullName.length > 160) {
      throw new ApiRequestError("Applicant name must be between 2 and 160 characters.", 400);
    }
    const phone = typeof data.phone === "string" ? data.phone.trim() : "";
    const department = typeof data.department === "string" ? data.department.trim() : "";
    const sessionYear = typeof data.sessionYear === "string" ? data.sessionYear.trim() : "";
    const semester = typeof data.semester === "number" ? data.semester : Number(data.semester);
    const message = typeof data.message === "string" ? data.message.trim() : "";
    if (phone.length > 30 || message.length > 3000) throw new ApiRequestError("Phone or message is too long.", 400);
    if (!department || department.length > 100) throw new ApiRequestError("Select a department or technology.", 400);
    if (sessionYear.length < 1 || sessionYear.length > 20) throw new ApiRequestError("Select an academic session.", 400);
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
      throw new ApiRequestError("Select a semester from 1 to 8.", 400);
    }

    const encryptedData = encryptApplicantData({
      fullName,
      email,
      phone,
      department,
      semester,
      sessionYear,
      message,
    });
    const passwordHash = await hash(password, 12);
    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const circular = await client.query<{ instituteId: string }>(
      `SELECT n.institute_id AS "instituteId"
       FROM public.notices n
       JOIN public.institutes i ON i.id = n.institute_id AND i.review_status = 'approved'
       WHERE n.id = $1 AND n.notice_type = 'admission' AND n.is_published = true
         AND (n.expires_at IS NULL OR n.expires_at > now())
         AND (n.application_deadline IS NULL OR n.application_deadline >= CURRENT_DATE)
       FOR SHARE`,
      [noticeId],
    );
    const selectedCircular = circular.rows[0];
    if (!selectedCircular) throw new ApiRequestError("This admission circular is closed or unavailable.", 404);

    const existingAccount = await client.query<{ id: string; passwordHash: string }>(
      `SELECT id, password_hash AS "passwordHash"
       FROM public.admission_applicant_accounts WHERE lower(email) = $1 FOR UPDATE`,
      [email],
    );
    let accountId: string;
    if (existingAccount.rows[0]) {
      const matches = await compare(password, existingAccount.rows[0].passwordHash);
      if (!matches) throw new ApiRequestError("An account already exists for this email. Enter its password to apply.", 409);
      accountId = existingAccount.rows[0].id;
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.admission_applicant_accounts (email, password_hash)
         VALUES ($1,$2) RETURNING id`,
        [email, passwordHash],
      );
      accountId = created.rows[0]!.id;
    }

    const trackingId = `EDU-${randomBytes(8).toString("hex").toUpperCase()}`;
    await client.query(
      `INSERT INTO public.institute_admission_applications
         (tracking_id, institute_id, notice_id, applicant_data_encrypted, status, applicant_account_id)
       VALUES ($1,$2,$3,$4,'submitted',$5)`,
      [trackingId, selectedCircular.instituteId, noticeId, encryptedData, accountId],
    );
    const session = await createApplicantSession(client, accountId);
    await client.query("COMMIT");
    transactionOpen = false;
    sessionToken = session.token;
    sessionExpiry = session.expiresAt;
    await getPool().query("DELETE FROM public.eduportal_login_attempts WHERE key_hash = ANY($1::char(64)[])", [[rateKeys.identity, rateKeys.address]]);
    const response = NextResponse.json({ trackingId, authenticated: true }, { status: 201 });
    setApplicantCookie(response, sessionToken, sessionExpiry);
    return response;
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return jsonError("An application has already been submitted for this circular using this account.", 409);
    }
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) return jsonError(error.message, error.status);
    console.error("Public application request failed.", error);
    return jsonError("Unable to complete the application request.", 500);
  } finally {
    client?.release();
  }
}
