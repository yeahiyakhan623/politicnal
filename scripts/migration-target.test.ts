import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { test } from "node:test";
import {
  assertSafeStagingMigrationEnvironment,
  assertStagingDatabaseIdentity,
  assertStagingNeonIdentity,
} from "./migration-target.ts";
import { migrationVersions } from "./migration-versions.ts";

const safeEnvironment = {
  MIGRATION_TARGET: "staging",
  ALLOW_STAGING_MIGRATIONS: "true",
  STAGING_RECOVERY_VERIFIED: "true",
  STAGING_DATABASE_URL: "postgresql://staging:secret@staging.example/neondb?sslmode=require",
  DATABASE_URL: "postgresql://production:secret@production.example/neondb?sslmode=require",
  STAGING_NEON_PROJECT_ID: "amrpi-project",
  STAGING_NEON_BRANCH_ID: "staging-branch",
  PRODUCTION_NEON_PROJECT_ID: "amrpi-project",
  PRODUCTION_NEON_BRANCH_ID: "production-branch",
};

test("requires explicit staging and recovery approval before migrations", () => {
  assert.doesNotThrow(() => assertSafeStagingMigrationEnvironment(safeEnvironment));
  assert.throws(
    () => assertSafeStagingMigrationEnvironment({ ...safeEnvironment, MIGRATION_TARGET: "production" }),
    /MIGRATION_TARGET=staging/,
  );
  assert.throws(
    () => assertSafeStagingMigrationEnvironment({ ...safeEnvironment, ALLOW_STAGING_MIGRATIONS: "false" }),
    /explicitly authorize/,
  );
  assert.throws(
    () => assertSafeStagingMigrationEnvironment({ ...safeEnvironment, STAGING_RECOVERY_VERIFIED: "false" }),
    /recovery point/,
  );
});

test("refuses production URLs and branches as staging migration targets", () => {
  assert.throws(
    () => assertSafeStagingMigrationEnvironment({
      ...safeEnvironment,
      STAGING_DATABASE_URL: safeEnvironment.DATABASE_URL,
    }),
    /must not reuse DATABASE_URL/,
  );
  assert.throws(
    () => assertSafeStagingMigrationEnvironment({
      ...safeEnvironment,
      STAGING_NEON_BRANCH_ID: safeEnvironment.PRODUCTION_NEON_BRANCH_ID,
    }),
    /must differ from the production branch ID/,
  );
  assert.throws(
    () => assertStagingDatabaseIdentity({
      database: "neondb",
      projectId: "amrpi-project",
      branchId: "production-branch",
      readOnly: "off",
    }, safeEnvironment),
    /does not match/,
  );
  assert.doesNotThrow(() => assertStagingDatabaseIdentity({
    database: "neondb",
    projectId: "amrpi-project",
    branchId: "staging-branch",
    readOnly: "off",
  }, safeEnvironment));
});

test("verifies staging identity independently of read-only transaction mode", () => {
  assert.doesNotThrow(() => assertStagingNeonIdentity({
    database: "neondb",
    projectId: "amrpi-project",
    branchId: "staging-branch",
  }, safeEnvironment));
  assert.throws(
    () => assertStagingNeonIdentity({
      database: "neondb",
      projectId: "amrpi-project",
      branchId: "production-branch",
    }, safeEnvironment),
    /does not match/,
  );
});

test("migration history matches every checked-in SQL file in contiguous order", async () => {
  const files = (await readdir(new URL("../prisma/migrations/", import.meta.url)))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .map((name) => name.slice(0, -4))
    .sort();
  assert.deepEqual(migrationVersions, files);
  migrationVersions.forEach((version, index) => {
    assert.equal(Number(version.slice(0, 3)), index + 1);
  });
});
