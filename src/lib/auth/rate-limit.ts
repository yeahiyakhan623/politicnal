import "server-only";

import { createHash } from "node:crypto";
import { getPool } from "@/lib/db";

export const MAX_AUTH_ATTEMPTS = 10;
export const AUTH_RATE_WINDOW_MINUTES = 15;

export function hashAuthRateKey(ip: string, identity: string) {
  return createHash("sha256").update(`${ip}:${identity}`).digest("hex");
}

export async function consumeAuthAttempt(keyHash: string) {
  const result = await getPool().query<{ attempt_count: number }>(
    `INSERT INTO public.eduportal_login_attempts (key_hash, window_started_at, attempt_count, updated_at)
     VALUES ($1, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (key_hash) DO UPDATE
     SET
       attempt_count = CASE
         WHEN eduportal_login_attempts.window_started_at <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 minute') THEN 1
         ELSE eduportal_login_attempts.attempt_count + 1
       END,
       window_started_at = CASE
         WHEN eduportal_login_attempts.window_started_at <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 minute') THEN CURRENT_TIMESTAMP
         ELSE eduportal_login_attempts.window_started_at
       END,
       updated_at = CURRENT_TIMESTAMP
     RETURNING attempt_count`,
    [keyHash, AUTH_RATE_WINDOW_MINUTES],
  );
  return Number(result.rows[0]?.attempt_count ?? MAX_AUTH_ATTEMPTS + 1);
}
