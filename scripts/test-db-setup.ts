import { readFile } from "node:fs/promises";
import { connectToTestDatabase } from "./test-db-safety.ts";

const migrations = [
  "044_student_profile_contact_fields",
  "045_allow_shared_pending_student_emails",
  "046_student_nfc_cards",
  "047_student_account_email_and_setup",
  "048_student_fee_summaries",
  "049_student_email_notification_types",
];

const client = await connectToTestDatabase();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('amrpi-isolated-test-schema'))");
  const baseline = await readFile(new URL("./test-db-baseline.sql", import.meta.url), "utf8");
  await client.query(baseline);
  await client.query("COMMIT");

  for (const version of migrations) {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT 1 FROM public.test_schema_migrations WHERE version = $1",
      [version],
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      console.info(`Local test migration ${version} already applied.`);
      continue;
    }

    const sql = await readFile(new URL(`../prisma/migrations/${version}.sql`, import.meta.url), "utf8");
    await client.query(sql);
    await client.query(
      "INSERT INTO public.test_schema_migrations (version) VALUES ($1)",
      [version],
    );
    await client.query("COMMIT");
    console.info(`Applied ${version} to the isolated local test database.`);
  }

  const state = await client.query<{
    migration_count: number;
    request_table: string | null;
    nfc_card_table: string | null;
    nfc_scan_table: string | null;
    father_column: string | null;
    mother_column: string | null;
    phone_column: string | null;
    email_delivery_table: string | null;
    setup_token_table: string | null;
    rejection_reason_column: string | null;
    student_fee_table: string | null;
    notification_types_check: boolean;
  }>(
    `SELECT
       (SELECT count(*)::int FROM public.test_schema_migrations
        WHERE version = ANY($1::varchar[])) AS migration_count,
       to_regclass('public.student_account_requests')::text AS request_table,
       to_regclass('public.student_nfc_cards')::text AS nfc_card_table,
       to_regclass('public.student_nfc_scan_logs')::text AS nfc_scan_table,
       (SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='students' AND column_name='father_name') AS father_column,
       (SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='students' AND column_name='mother_name') AS mother_column,
       (SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='students' AND column_name='student_phone') AS phone_column,
       to_regclass('public.student_account_email_deliveries')::text AS email_delivery_table,
       to_regclass('public.student_password_setup_tokens')::text AS setup_token_table,
       (SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='student_account_requests'
          AND column_name='rejection_reason') AS rejection_reason_column,
       to_regclass('public.student_fee_summaries')::text AS student_fee_table,
       EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.student_account_email_deliveries'::regclass
           AND conname = 'student_account_email_deliveries_notification_type_check'
           AND pg_get_constraintdef(oid) LIKE '%password_setup_confirmation%'
       ) AS notification_types_check`,
    [migrations],
  );
  const result = state.rows[0];
  if (
    result?.migration_count !== migrations.length ||
    !result.request_table ||
    !result.nfc_card_table ||
    !result.nfc_scan_table ||
    !result.email_delivery_table ||
    !result.setup_token_table ||
    !result.student_fee_table ||
    !result.notification_types_check ||
    result.rejection_reason_column !== "rejection_reason" ||
    result.father_column !== "father_name" ||
    result.mother_column !== "mother_name" ||
    result.phone_column !== "student_phone"
  ) {
    throw new Error("Isolated test schema verification failed.");
  }

  const identity = await client.query("SELECT current_database() AS database, current_user AS username");
  console.info(`Verified local schema in ${identity.rows[0].database} as ${identity.rows[0].username}.`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
