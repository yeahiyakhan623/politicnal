import { config, parse } from "dotenv";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { normalizePostgresConnectionString } from "../src/lib/db-url.ts";
import {
  assertSafeStagingMigrationEnvironment,
  assertStagingDatabaseIdentity,
  assertStagingNeonIdentity,
} from "./migration-target.ts";
import { migrationVersions } from "./migration-versions.ts";

const localEnvironment = config({ path: ".env" });
if (localEnvironment.error) throw new Error("Cannot load .env. Refusing to run database migrations.");
const productionDatabaseUrl = process.env.DATABASE_URL;
const stagingEnvironmentFile = await readFile(".env.staging", "utf8").catch(() => {
  throw new Error("Cannot load .env.staging. Refusing to run database migrations.");
});
const stagingEnvironmentValues = parse(stagingEnvironmentFile);
if (Object.hasOwn(stagingEnvironmentValues, "DATABASE_URL")) {
  throw new Error(".env.staging must use STAGING_DATABASE_URL, not DATABASE_URL.");
}
config({ path: ".env.staging", override: true });

const migrationEnvironment = {
  MIGRATION_TARGET: process.env.MIGRATION_TARGET,
  ALLOW_STAGING_MIGRATIONS: process.env.ALLOW_STAGING_MIGRATIONS,
  STAGING_RECOVERY_VERIFIED: process.env.STAGING_RECOVERY_VERIFIED,
  STAGING_DATABASE_URL: process.env.STAGING_DATABASE_URL,
  DATABASE_URL: productionDatabaseUrl,
  STAGING_NEON_PROJECT_ID: process.env.STAGING_NEON_PROJECT_ID,
  STAGING_NEON_BRANCH_ID: process.env.STAGING_NEON_BRANCH_ID,
  PRODUCTION_NEON_PROJECT_ID: process.env.PRODUCTION_NEON_PROJECT_ID,
  PRODUCTION_NEON_BRANCH_ID: process.env.PRODUCTION_NEON_BRANCH_ID,
};
assertSafeStagingMigrationEnvironment(migrationEnvironment);

const databaseUrl = migrationEnvironment.STAGING_DATABASE_URL!;

const migrations = migrationVersions.map((version, index) => ({
  version,
  expectedPreviousVersion: migrationVersions[index - 1] ?? null,
}));
const client = new pg.Client({
  connectionString: normalizePostgresConnectionString(databaseUrl),
});

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const identity = await client.query<{
    database: string;
    projectId: string | null;
    branchId: string | null;
    readOnly: string;
  }>(
    `SELECT current_database() AS database,
            current_setting('neon.project_id', true) AS "projectId",
            current_setting('neon.branch_id', true) AS "branchId",
            current_setting('transaction_read_only') AS "readOnly"`,
  );
  const connectedIdentity = identity.rows[0];
  if (!connectedIdentity) throw new Error("Could not verify connected staging database identity.");
  assertStagingNeonIdentity(connectedIdentity, migrationEnvironment);
  if (connectedIdentity.readOnly !== "on") {
    throw new Error("Could not confirm a read-only staging identity check.");
  }
  await client.query("ROLLBACK");
  console.info("Verified staging project and branch identity in a read-only transaction.");

  await client.query("BEGIN");
  const writeIdentity = await client.query<{
    database: string;
    projectId: string | null;
    branchId: string | null;
    readOnly: string;
  }>(
    `SELECT current_database() AS database,
            current_setting('neon.project_id', true) AS "projectId",
            current_setting('neon.branch_id', true) AS "branchId",
            current_setting('transaction_read_only') AS "readOnly"`,
  );
  const writableIdentity = writeIdentity.rows[0];
  if (!writableIdentity) throw new Error("Could not re-verify staging identity before database initialization.");
  assertStagingDatabaseIdentity(writableIdentity, migrationEnvironment);

  const ledger = await client.query<{ name: string | null }>(
    "SELECT to_regclass('public.schema_migrations')::text AS name",
  );
  const applicationObjects = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM pg_class relation
     JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
       AND namespace.nspname NOT LIKE 'pg_toast%'
       AND NOT (namespace.nspname = 'public' AND relation.relname = 'schema_migrations')`,
  );
  const applicationObjectCount = applicationObjects.rows[0]?.count ?? 0;
  if (!ledger.rows[0]?.name && applicationObjectCount > 0) {
    throw new Error("Staging contains database objects without a migration ledger. Refusing to initialize an unknown schema.");
  }
  if (ledger.rows[0]?.name) {
    const history = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM public.schema_migrations",
    );
    if (!history.rows[0]?.count && applicationObjectCount > 0) {
      throw new Error("Staging has application objects but no migration history. Refusing to initialize an unknown schema.");
    }
  } else {
    await client.query(
      `CREATE TABLE public.schema_migrations (
         version varchar(120) PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    console.info("Initialized the empty staging migration ledger.");
  }
  await client.query("COMMIT");

  for (const migration of migrations) {
    await client.query("BEGIN");
    const transactionIdentity = await client.query<{
      database: string;
      projectId: string | null;
      branchId: string | null;
      readOnly: string;
    }>(
      `SELECT current_database() AS database,
              current_setting('neon.project_id', true) AS "projectId",
              current_setting('neon.branch_id', true) AS "branchId",
              current_setting('transaction_read_only') AS "readOnly"`,
    );
    const currentIdentity = transactionIdentity.rows[0];
    if (!currentIdentity) throw new Error("Could not verify staging identity before a migration.");
    assertStagingDatabaseIdentity(currentIdentity, migrationEnvironment);
    await client.query("SELECT pg_advisory_xact_lock(hashtext('eduportal-custom-schema-migrations'))");

    const existing = await client.query<{ version: string }>(
      "SELECT version FROM public.schema_migrations WHERE version = $1",
      [migration.version],
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      console.info(`Migration ${migration.version} is already applied.`);
      continue;
    }

    const previous = await client.query<{ version: string }>(
      "SELECT version FROM public.schema_migrations ORDER BY version DESC LIMIT 1",
    );
    const previousVersion = previous.rows[0]?.version ?? null;
    if (previousVersion !== migration.expectedPreviousVersion) {
      throw new Error(`Expected latest migration ${migration.expectedPreviousVersion}; found ${previous.rows[0]?.version ?? "none"}. Refusing to modify this database.`);
    }

    const sql = await readFile(new URL(`../prisma/migrations/${migration.version}.sql`, import.meta.url), "utf8");
    await client.query(sql);
    await client.query(
      "INSERT INTO public.schema_migrations (version) VALUES ($1)",
      [migration.version],
    );
    await client.query("COMMIT");
    console.info(`Applied migration ${migration.version}.`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
