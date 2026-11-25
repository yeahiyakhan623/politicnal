import "server-only";

import { getPool } from "@/lib/db";

export async function hasSuperAdmin() {
  const result = await getPool().query(
    "SELECT 1 FROM public.users WHERE role = 'super_admin' LIMIT 1",
  );
  return Boolean(result.rowCount);
}
