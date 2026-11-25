import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import { normalizeRole, type AuthenticatedUser } from "@/lib/auth/authorization";

export const SESSION_COOKIE = "eduportal_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export type SessionUser = AuthenticatedUser & {
  name: string;
  email: string;
  studentId: string | null;
  passwordChangeRequired: boolean;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, client?: PoolClient) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const database = client ?? getPool();
  const result = await database.query<{ expires_at: Date }>(
    `INSERT INTO public.eduportal_sessions (user_id, token_hash, token_version, expires_at)
     SELECT id, $2, token_version, now() + ($3 * interval '1 second')
     FROM public.users
     WHERE id = $1 AND is_active = true
     RETURNING expires_at`,
    [userId, tokenHash, SESSION_DURATION_SECONDS],
  );
  const expiresAt = result.rows[0]?.expires_at;
  if (!expiresAt) throw new Error("Active user account was not found while creating a session.");

  return { token, expiresAt };
}

export async function revokeSession(token: string) {
  await getPool().query(
    "DELETE FROM public.eduportal_sessions WHERE token_hash = $1",
    [hashToken(token)],
  );
}

export async function getCurrentSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;

  const result = await getPool().query<{
    id: string;
    institute_id: string | null;
    role: string;
    name: string;
    email: string;
    student_id: string | null;
    password_change_required: boolean;
  }>(
    `SELECT u.id, u.institute_id, u.role, u.name, u.email, u.student_id,
            u.password_change_required
     FROM public.eduportal_sessions s
     JOIN public.users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND u.is_active = true
       AND s.token_version = u.token_version
     LIMIT 1`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  const role = normalizeRole(row.role);
  if (!role) return null;
  return {
    id: row.id,
    instituteId: row.institute_id,
    role,
    name: row.name,
    email: row.email,
    studentId: row.student_id,
    passwordChangeRequired: row.password_change_required,
  };
}
