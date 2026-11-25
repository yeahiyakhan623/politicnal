import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import pg from "pg";
import { normalizePostgresConnectionString } from "../src/lib/db-url.ts";

const DEMO_INSTITUTE = {
  name: "AMRPI Staging Demo Institute",
  type: "polytechnic",
  officialEmail: "staging-demo-institute@example.invalid",
  registrationId: "AMRPI-STAGING-DEMO",
  category: "polytechnic",
};
const DEMO_STUDENT = {
  name: "Staging Demo Student",
  fatherName: "Staging Demo Parent",
  roll: "STAGE-REQ-0001",
  registration: "STAGE-REQ-0001-REG",
  email: "staging-demo-student@example.invalid",
  phone: "0000000000",
  semester: 1,
  department: "Computer Technology",
  sessionYear: "2025-26",
};

if (process.env.STAGING_DEMO_SEED !== "1") {
  throw new Error("Set STAGING_DEMO_SEED=1 to explicitly seed synthetic staging data.");
}

const local = dotenv.parse(await readFile(".env", "utf8"));
const staging = dotenv.parse(await readFile(".env.staging", "utf8"));
if (
  !local.DATABASE_URL ||
  local.DATABASE_URL !== staging.STAGING_DATABASE_URL ||
  staging.MIGRATION_TARGET !== "staging" ||
  staging.ALLOW_STAGING_MIGRATIONS !== "false" ||
  staging.STAGING_NEON_PROJECT_ID !== staging.PRODUCTION_NEON_PROJECT_ID ||
  !staging.STAGING_NEON_BRANCH_ID ||
  staging.STAGING_NEON_BRANCH_ID === staging.PRODUCTION_NEON_BRANCH_ID
) {
  throw new Error("Local app must target the independently configured staging branch; production and migrations are not allowed.");
}

const client = new pg.Client({
  connectionString: normalizePostgresConnectionString(staging.STAGING_DATABASE_URL),
  connectionTimeoutMillis: 10_000,
  application_name: "amrpi-staging-request-demo-seed",
});

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const identity = await client.query<{
    projectId: string | null;
    branchId: string | null;
    latestMigration: string | null;
    hasRequests: boolean;
    hasTokens: boolean;
    hasFees: boolean;
  }>(
    `SELECT current_setting('neon.project_id', true) AS "projectId",
            current_setting('neon.branch_id', true) AS "branchId",
            (SELECT version FROM public.schema_migrations ORDER BY version DESC LIMIT 1) AS "latestMigration",
            to_regclass('public.student_account_requests') IS NOT NULL AS "hasRequests",
            to_regclass('public.student_password_setup_tokens') IS NOT NULL AS "hasTokens",
            to_regclass('public.student_fee_summaries') IS NOT NULL AS "hasFees"`,
  );
  const verified = identity.rows[0];
  if (
    verified?.projectId !== staging.STAGING_NEON_PROJECT_ID ||
    verified.projectId !== staging.PRODUCTION_NEON_PROJECT_ID ||
    verified.branchId !== staging.STAGING_NEON_BRANCH_ID ||
    verified.branchId === staging.PRODUCTION_NEON_BRANCH_ID ||
    verified.latestMigration !== "051_application_performance_indexes" ||
    !verified.hasRequests ||
    !verified.hasTokens ||
    !verified.hasFees
  ) {
    throw new Error("Connected database does not match the verified staging identity and current schema.");
  }
  await client.query("ROLLBACK");

  await client.query("BEGIN");
  const lockedIdentity = await client.query<{
    projectId: string | null;
    branchId: string | null;
  }>(
    `SELECT current_setting('neon.project_id', true) AS "projectId",
            current_setting('neon.branch_id', true) AS "branchId"`,
  );
  if (
    lockedIdentity.rows[0]?.projectId !== staging.STAGING_NEON_PROJECT_ID ||
    lockedIdentity.rows[0]?.branchId !== staging.STAGING_NEON_BRANCH_ID
  ) {
    throw new Error("Staging identity changed before seeding.");
  }
  await client.query("SELECT pg_advisory_xact_lock(hashtext('amrpi-staging-request-demo-seed'))");

  const existingInstitute = await client.query<{
    id: string;
    name: string;
    type: string;
    category: string | null;
    reviewStatus: string;
  }>(
    `SELECT id, name, type, category, review_status AS "reviewStatus"
     FROM public.institutes
     WHERE official_email = $1 OR registration_id = $2
     FOR UPDATE`,
    [DEMO_INSTITUTE.officialEmail, DEMO_INSTITUTE.registrationId],
  );
  let instituteId: string;
  if (existingInstitute.rows.length) {
    const institute = existingInstitute.rows[0]!;
    if (
      existingInstitute.rows.length !== 1 ||
      institute.name !== DEMO_INSTITUTE.name ||
      institute.type !== DEMO_INSTITUTE.type ||
      institute.category !== DEMO_INSTITUTE.category ||
      institute.reviewStatus !== "approved"
    ) {
      throw new Error("A demo institute identifier is already in use by unexpected data; refusing to modify it.");
    }
    instituteId = institute.id;
  } else {
    const superAdmin = await client.query<{ id: string }>(
      `SELECT id FROM public.users
       WHERE role = 'super_admin' AND is_active = true
       ORDER BY created_at
       LIMIT 1`,
    );
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO public.institutes
         (name, type, official_email, registration_id, category, review_status, reviewed_by, reviewed_at)
       VALUES ($1,$2,$3,$4,$5,'approved',$6,now())
       RETURNING id`,
      [
        DEMO_INSTITUTE.name,
        DEMO_INSTITUTE.type,
        DEMO_INSTITUTE.officialEmail,
        DEMO_INSTITUTE.registrationId,
        DEMO_INSTITUTE.category,
        superAdmin.rows[0]?.id ?? null,
      ],
    );
    instituteId = inserted.rows[0]!.id;
  }

  const existingStudent = await client.query<{
    id: string;
    instituteId: string;
    fullName: string | null;
    fatherName: string | null;
    registrationNumber: string | null;
    isActive: boolean;
    approvalStatus: string;
  }>(
    `SELECT id, institute_id AS "instituteId", full_name AS "fullName",
            father_name AS "fatherName", registration_number AS "registrationNumber",
            is_active AS "isActive", approval_status AS "approvalStatus"
     FROM public.students
     WHERE (institute_id = $1 AND lower(trim(roll_number)) = lower($2))
        OR (institute_id = $1 AND lower(trim(registration_number)) = lower($3))
     FOR UPDATE`,
    [instituteId, DEMO_STUDENT.roll, DEMO_STUDENT.registration],
  );
  let studentId: string;
  if (existingStudent.rows.length) {
    const student = existingStudent.rows[0]!;
    if (
      existingStudent.rows.length !== 1 ||
      student.instituteId !== instituteId ||
      student.fullName !== DEMO_STUDENT.name ||
      student.fatherName !== DEMO_STUDENT.fatherName ||
      student.registrationNumber !== DEMO_STUDENT.registration ||
      !student.isActive ||
      student.approvalStatus !== "approved"
    ) {
      throw new Error("A demo student identifier is already in use by unexpected data; refusing to modify it.");
    }
    studentId = student.id;
  } else {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO public.students
         (institute_id, full_name, roll_number, registration_number, email,
          father_name, student_phone, semester, department, session_year,
          is_active, approval_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'approved')
       RETURNING id`,
      [
        instituteId,
        DEMO_STUDENT.name,
        DEMO_STUDENT.roll,
        DEMO_STUDENT.registration,
        DEMO_STUDENT.email,
        DEMO_STUDENT.fatherName,
        DEMO_STUDENT.phone,
        DEMO_STUDENT.semester,
        DEMO_STUDENT.department,
        DEMO_STUDENT.sessionYear,
      ],
    );
    studentId = inserted.rows[0]!.id;
  }

  const linkedAccount = await client.query(
    `SELECT 1 FROM public.users
     WHERE student_id = $1 AND role = 'student'`,
    [studentId],
  );
  const existingRequest = await client.query<{ status: string }>(
    `SELECT status FROM public.student_account_requests
     WHERE institute_id = $1 AND student_id = $2
     ORDER BY requested_at DESC
     LIMIT 1`,
    [instituteId, studentId],
  );
  if (linkedAccount.rowCount || existingRequest.rows[0]?.status === "approved") {
    throw new Error("The demo student already has an account or approved request; refusing to change account state.");
  }

  await client.query("COMMIT");
  console.info("Verified staging demo data is ready.");
  console.info(`Institute: ${DEMO_INSTITUTE.name} (${instituteId})`);
  console.info(`Student: ${DEMO_STUDENT.name}`);
  console.info(`Father: ${DEMO_STUDENT.fatherName}`);
  console.info(`Roll: ${DEMO_STUDENT.roll}`);
  console.info(`Registration: ${DEMO_STUDENT.registration}`);
  console.info("Use a synthetic .invalid email and phone in the public account request form.");
  console.info(`Demo student ID: ${studentId}`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
