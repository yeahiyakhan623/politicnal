import "server-only";

import pg from "pg";
import { normalizePostgresConnectionString } from "./db-url.ts";

const globalForPool = globalThis as typeof globalThis & {
  eduportalPool?: pg.Pool;
};

export function getPool() {
  if (globalForPool.eduportalPool) return globalForPool.eduportalPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL must be configured.");

  const pool = new pg.Pool({
    connectionString: normalizePostgresConnectionString(connectionString),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "eduportal-bd",
  });
  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error.", error);
  });
  globalForPool.eduportalPool = pool;
  return pool;
}
