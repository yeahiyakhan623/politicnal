import { config } from "dotenv";
import pg from "pg";
import { normalizePostgresConnectionString } from "../src/lib/db-url.ts";

const TEST_DATABASE_NAME = "amrpi_test";
const TEST_DATABASE_USER = "amrpi_test";
const TEST_DATABASE_HOST = "127.0.0.1";
const TEST_DATABASE_PORT = "5433";

export function assertSafeTestDatabaseUrl(connectionString: string) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(".env.test DATABASE_URL is invalid.");
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== TEST_DATABASE_HOST ||
    url.port !== TEST_DATABASE_PORT ||
    url.pathname !== `/${TEST_DATABASE_NAME}` ||
    decodeURIComponent(url.username) !== TEST_DATABASE_USER
  ) {
    throw new Error("Unsafe test database target. Only amrpi_test at 127.0.0.1:5433 is allowed.");
  }
}

export function loadTestDatabaseEnvironment() {
  const result = config({ path: ".env.test", override: true });
  if (result.error) {
    throw new Error("Cannot load .env.test. Test database commands are blocked.");
  }
  if (process.env.TEST_DATABASE !== "1") {
    throw new Error("TEST_DATABASE=1 is required. Test database command is blocked.");
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is missing from .env.test.");
  assertSafeTestDatabaseUrl(connectionString);
  return connectionString;
}

export async function connectToTestDatabase() {
  const connectionString = loadTestDatabaseEnvironment();
  const client = new pg.Client({
    connectionString: normalizePostgresConnectionString(connectionString),
    connectionTimeoutMillis: 8_000,
    application_name: "amrpi-isolated-test",
  });
  await client.connect();
  try {
    const identity = await client.query<{
      database: string;
      username: string;
    }>("SELECT current_database() AS database, current_user AS username");
    if (
      identity.rows[0]?.database !== TEST_DATABASE_NAME ||
      identity.rows[0]?.username !== TEST_DATABASE_USER
    ) {
      throw new Error("Connected PostgreSQL identity does not match the isolated test database.");
    }
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}
