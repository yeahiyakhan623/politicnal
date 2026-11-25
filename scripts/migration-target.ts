type StagingMigrationEnvironment = {
  MIGRATION_TARGET?: string;
  ALLOW_STAGING_MIGRATIONS?: string;
  STAGING_RECOVERY_VERIFIED?: string;
  STAGING_DATABASE_URL?: string;
  DATABASE_URL?: string;
  STAGING_NEON_PROJECT_ID?: string;
  STAGING_NEON_BRANCH_ID?: string;
  PRODUCTION_NEON_PROJECT_ID?: string;
  PRODUCTION_NEON_BRANCH_ID?: string;
};

export function assertSafeStagingMigrationEnvironment(env: StagingMigrationEnvironment) {
  if (env.MIGRATION_TARGET !== "staging") {
    throw new Error("Database migrations require MIGRATION_TARGET=staging.");
  }
  if (env.ALLOW_STAGING_MIGRATIONS !== "true") {
    throw new Error("Set ALLOW_STAGING_MIGRATIONS=true to explicitly authorize staging migrations.");
  }
  if (env.STAGING_RECOVERY_VERIFIED !== "true") {
    throw new Error("Verify the staging branch recovery point before allowing schema changes.");
  }

  const requiredValues = [
    env.STAGING_DATABASE_URL,
    env.STAGING_NEON_PROJECT_ID,
    env.STAGING_NEON_BRANCH_ID,
    env.PRODUCTION_NEON_PROJECT_ID,
    env.PRODUCTION_NEON_BRANCH_ID,
  ];
  if (requiredValues.some((value) => !value?.trim())) {
    throw new Error("Set the staging URL and independently verified Neon project/branch IDs.");
  }
  if (env.STAGING_NEON_PROJECT_ID !== env.PRODUCTION_NEON_PROJECT_ID) {
    throw new Error("The staging branch must belong to the verified AMRPI Neon project.");
  }
  if (env.STAGING_NEON_BRANCH_ID === env.PRODUCTION_NEON_BRANCH_ID) {
    throw new Error("The staging branch ID must differ from the production branch ID.");
  }
  if (env.STAGING_DATABASE_URL === env.DATABASE_URL) {
    throw new Error("The staging connection must not reuse DATABASE_URL.");
  }

  let url: URL;
  try {
    url = new URL(env.STAGING_DATABASE_URL!);
  } catch {
    throw new Error("STAGING_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("STAGING_DATABASE_URL must use PostgreSQL.");
  }
}

export function assertStagingDatabaseIdentity(
  identity: {
    database: string;
    projectId: string | null;
    branchId: string | null;
    readOnly: string;
  },
  env: StagingMigrationEnvironment,
) {
  assertStagingNeonIdentity(identity, env);
  if (identity.readOnly !== "off") {
    throw new Error("The verified staging database is unavailable for migration.");
  }
}

export function assertStagingNeonIdentity(
  identity: {
    database: string;
    projectId: string | null;
    branchId: string | null;
  },
  env: StagingMigrationEnvironment,
) {
  if (
    identity.projectId !== env.STAGING_NEON_PROJECT_ID ||
    identity.projectId !== env.PRODUCTION_NEON_PROJECT_ID ||
    identity.branchId !== env.STAGING_NEON_BRANCH_ID ||
    identity.branchId === env.PRODUCTION_NEON_BRANCH_ID
  ) {
    throw new Error("Connected Neon project/branch does not match the independently verified staging identity.");
  }
  if (!identity.database) {
    throw new Error("The verified staging database is unavailable.");
  }
}
