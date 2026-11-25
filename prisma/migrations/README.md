# Migration history and staging baseline

## Baseline provenance and assumptions

Migrations `001`–`027` are byte-for-byte copies of the versioned SQL history in the sibling `Results/backend/src/db/migrations` tree. Its migration runner sorts those filenames, records each filename in `schema_migrations`, and includes the exact `027_university_notice_applications` version required as the predecessor of this project's migration 028. The base tables and columns in that chain match the dependencies referenced by migrations 028–051. The local test baseline is not used as the source.

The staging database was observed to contain no non-system tables. The original 001–027 sequence and migrations 028–050 were applied to that empty staging database after explicit approval. This created the schema and genuine per-migration ledger records, not fabricated history. Several source migrations contain `UPDATE` statements; on the empty database they had no business rows to change. The 031/032 table drops affected only the empty tables created by the same migration sequence. The source was not compared against production or an external backup.

The runner creates `public.schema_migrations` only if no other non-system relation exists. It refuses to adopt existing relations without a consistent migration ledger, checks the exact prior migration version, and applies each migration and its ledger entry in one transaction. Some SQL is not safe to replay manually; the ledger is the sole replay guard.

## Per-migration review

Dependencies below are strictly sequential: each migration requires the immediately preceding version recorded in `public.schema_migrations`. “Empty-baseline effect” refers only to the clean staging schema, not to an existing populated database.

| Version | Schema and data effects | Destructive effects, dependencies, and failure considerations |
|---|---|---|
| [001](./001_initial_schema.sql) | Creates institutes, users, class batches, students, results, notices, subscriptions, indexes, and constraints. No business rows inserted. | Requires PostgreSQL 15+ for `NULLS NOT DISTINCT`; staging reports PostgreSQL 18.6. Tables use `IF NOT EXISTS`, but do not use this as a reconciliation mechanism for unknown schemas. |
| [002](./002_government_notices.sql) | Creates government notice storage and search indexes. | Requires the initial schema; no data changes. |
| [003](./003_student_applications.sql) | Creates encrypted student applications, history, and access-log tables and indexes. | Requires users from 001. No business data changes. |
| [004](./004_institute_types.sql) | Replaces the institute type check constraint with expanded allowed types. | Existing values outside the expanded set would cause constraint creation to fail; no rows exist on clean baseline. |
| [005](./005_admission_notices.sql) | Adds notice type/deadline fields, changes category checks, and creates sync-state storage. | Alters shared notice constraints; existing invalid categories could fail. |
| [006](./006_ensure_government_notice_sync_state.sql) | Ensures government notice sync-state table exists. | No row changes; table creation is guarded. |
| [007](./007_local_payment_methods.sql) | Adds class-group data and payment flags, backfills legacy subscription rows, and replaces payment checks/indexes. | Updates existing subscriptions; may fail on duplicate class identities. No rows exist on clean baseline. |
| [008](./008_institute_categories.sql) | Adds and backfills institute categories, then adds a category check. | Updates institute rows; existing category/type combinations can fail validation. |
| [009](./009_super_admin_username.sql) | Adds username and a partial unique index for super-admin usernames. | Duplicate normalized usernames would fail index creation. |
| [010](./010_class_subject_gradebook.sql) | Adds class/subject categories, creates subject schema and indexes, and backfills result categories. | Updates existing classes/results; invalid categories or inconsistent references can fail constraints. |
| [011](./011_instant_institute_access.sql) | Allows nullable registration IDs, adds instant-access flag, and creates a partial unique index. | Replaces an existing uniqueness rule; duplicate non-null IDs would fail. |
| [012](./012_class_subject_templates.sql) | Replaces class-batch identity index with a null-aware unique identity. | Duplicate identities after normalization would fail. |
| [013](./013_institute_password_management.sql) | Adds password-change/version fields, reset-token storage, and password-management audit storage. | No existing account values are overwritten beyond column defaults. |
| [014](./014_result_academic_session_exam_year.sql) | Adds/backfills result exam years, validates ranges, and replaces result identity uniqueness. | Raises an explicit error on collisions; drops the old unique constraint. No rows exist on clean baseline. |
| [015](./015_platform_analytics_audit.sql) | Creates analytics and admin-audit tables and indexes. | No business data changes. |
| [016](./016_student_profiles_and_search.sql) | Adds student/guardian contact fields and student search indexes. | No existing values overwritten; index creation can fail if required text-search support is unavailable. |
| [017](./017_class_batch_identity_constraint.sql) | Replaces the class-batch unique index. | Duplicate identities would fail. |
| [018](./018_teachers_attendance_admissions.sql) | Adds notice admission fields and creates teachers, attendance, institute-admission, and access-log tables and indexes. | Adds foreign keys to existing institutes/users/classes/students; incompatible existing rows can block constraints. |
| [019](./019_student_contact_details.sql) | Adds student phone, guardian phone, and email columns. | No existing values overwritten. |
| [020](./020_institute_public_profiles.sql) | Creates institute public-profile table. | No business data changes. |
| [021](./021_institute_profile_media.sql) | Adds logo, cover, website, and gallery fields. | No existing values overwritten. |
| [022](./022_institute_leadership_profiles.sql) | Adds principal contact and message fields. | No existing values overwritten. |
| [023](./023_teacher_profile_photos.sql) | Adds teacher photo URL. | No existing values overwritten. |
| [024](./024_notice_attachments.sql) | Adds notice attachment metadata and a consistency check. | Existing partial or invalid attachment metadata would fail the new constraint. |
| [025](./025_student_registration_accounts.sql) | Adds student role/link fields, approval status, and student identity constraints/indexes. | Existing users with invalid role/student links or duplicate student identities can block constraints. |
| [026](./026_search_performance_indexes.sql) | Enables `pg_trgm` and creates trigram indexes. | Requires extension availability and database privileges; both were confirmed available for staging. |
| [027](./027_university_notice_applications.sql) | Expands government-notice categories and adds application notice metadata. | Existing invalid notice categories would fail the check. This is the exact predecessor named by migration 028. |
| [028](./028_student_portal_security.sql) | Creates hashed session and login-attempt storage and unique student identity indexes. | Existing duplicate normalized student registrations or class rolls would fail indexes. |
| [029](./029_admin_registration_invites.sql) | Creates admin invites and adds normalized user-email uniqueness. | Existing duplicate normalized account emails would fail index creation. |
| [030](./030_pending_admin_registrations.sql) | Creates legacy pending-admin registration storage and indexes. | No data changes. |
| [031](./031_single_super_admin.sql) | Deactivates active institute-admin accounts, audits/de-reviews pending registrations, clears pending password hashes, and drops admin invites. | Account access changes and invite-table drop are destructive. On a clean sequence, affected tables were created empty by 029–030; populated deployments would need explicit review. |
| [032](./032_remove_admin_registration_requests.sql) | Drops legacy admin-registration table. | Irreversible table drop; empty after 031 only on a clean baseline. |
| [033](./033_semester_department_student_directory.sql) | Adds/backfills student semester/department, relaxes legacy required fields, adds checks and directory indexes. | Updates all eligible students; duplicate normalized roll identities or invalid values can fail constraints/indexes. |
| [034](./034_student_session_year.sql) | Adds/backfills student session year and an institute/session index. | Updates rows from class batches; malformed source years may yield null values. |
| [035](./035_attendance_tracking.sql) | Adds/backfills attendance snapshots, relaxes class-batch requirement, adds checks and history indexes. | Updates attendance rows; invalid semesters/departments or duplicate student/day attendance can fail. |
| [036](./036_semester_exam_results.sql) | Creates semester subjects/results and indexes; imports subjects from legacy class-batch subjects. | Inserts derived catalog rows when source rows exist; invalid legacy marks/department data can fail. |
| [037](./037_polytechnic_default_subject_catalog.sql) | Inserts default subject catalog entries for supported terms/departments. | Adds reference rows, not student records; can be rerun safely only under migration-ledger control. |
| [038](./038_exam_full_marks.sql) | Adds/backfills full-mark values and enforces a positive-value check. | Updates existing results; invalid legacy subject relationships may leave nulls and block `NOT NULL`. |
| [039](./039_institute_notice_board.sql) | Creates institute notice and attachment storage and index. | No existing data changes. |
| [040](./040_public_portal_applicant_accounts.sql) | Creates applicant accounts/sessions, links admissions applications, and adds indexes. | Adds a nullable foreign-key column; unique index may fail if duplicate account/notice links already exist. |
| [041](./041_institute_public_profiles.sql) | Extends/backfills public profiles and inserts defaults for approved polytechnic institutes. | Updates profile rows and inserts one default profile where absent; clean empty baseline has no institutes to seed. |
| [042](./042_public_profile_branding.sql) | Adds/backfills institute branding fields. | Updates existing profiles from institute names/defaults; no rows on empty baseline. |
| [043](./043_student_portal_requests.sql) | Creates student account requests and pending request indexes. | Existing duplicate pending emails or student requests would fail unique indexes. |
| [044](./044_student_profile_contact_fields.sql) | Adds father, mother, and student-phone fields. | No existing values overwritten. |
| [045](./045_allow_shared_pending_student_emails.sql) | Drops the pending-email unique index to permit shared pending contact emails. | Removes a uniqueness protection; the student-specific pending-request index remains. |
| [046](./046_student_nfc_cards.sql) | Creates NFC-card and scan-log tables, foreign keys, checks, and indexes. | No existing data changes. |
| [047](./047_student_account_email_and_setup.sql) | Adds rejection reason, creates email-delivery and password-setup-token tables, and backfills delivery records for approved/rejected requests. | Inserts derived delivery status for existing requests; no rows on empty baseline. |
| [048](./048_student_fee_summaries.sql) | Creates semester fee summaries and index with amount/term checks. | No existing data changes. |
| [049](./049_student_email_notification_types.sql) | Replaces notification-type check to allow request receipts and setup confirmations; adds delivery lookup index. | Existing unsupported notification values would fail the check. |
| [050](./050_student_email_notification_type_length.sql) | Widens the student email notification type column to fit the allowed `password_setup_confirmation` value. | Applied to staging after explicit approval; no row values are changed. |
| [051](./051_application_performance_indexes.sql) | Adds compound directory, roster, fee, and published-result lookup indexes plus a partial index for stale email-delivery cleanup. | Adds indexes over existing student/result rows; apply through the verified migration runner and consider table size/lock impact. |

## Approval and execution status

The staging project/branch was verified in read-only transactions before and after migration. Neon Console showed a six-hour point-in-time restore history for the **staging** branch and no scheduled snapshots. Migrations 001–050 were applied in order and the schema and ledger were verified read-only; migration 051 is newly added and has not been applied. `.env.staging` has `ALLOW_STAGING_MIGRATIONS=false`; `STAGING_RECOVERY_VERIFIED=true` records the recovery history evidence shown for staging. Production was not connected to or modified.

Authorized staging end-to-end testing passed 19 checks, including identity and clean starting state, Super Admin bootstrap restrictions, request submission and duplicate prevention, admin authorization and decisions, student login ID delivery and login, forced first-login password change, password reset/logout, student profile and peer isolation, results, semester fees/dues, attendance, account activation/deactivation, email failure/retry handling, and local-only receipt/approval/rejection/reset email tracking. Approval email includes a unique roll-based Student Login ID with collision fallback and a random temporary password; only its bcrypt hash is stored, and retry rotates the password before resending. The local SMTP sink accepted only synthetic `.invalid` recipients; live delivery to a controlled test inbox remains unverified because no usable inbox address was provided. A security review found and the application fixed unauthenticated Super Admin bootstrap on an initialized database; the E2E suite verifies the denial and confirms first-run setup still works. The test runner removed all uniquely generated synthetic records. Automated tests (46), lint, typecheck, and the staging-isolated production build passed. `.env.staging` has `ALLOW_STAGING_MIGRATIONS=false`. No production endpoint or data was accessed or modified.
