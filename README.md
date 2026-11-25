# AMRPI

AMRPI is an education-management portal for Anjuman Moklesur Rahman Polytechnic Institute.

## Current implementation

The current application is an early Next.js implementation:

- Responsive dark navy and emerald dashboard shell
- Eight-semester Student Directory with database-backed student records, semester/department/session filtering, and targeted CSV/XLSX imports
- Attendance entry and history filtered by semester, department, date, month, student name, and roll number
- Semester- and department-scoped exam subjects, custom subject setup, and per-student result publishing
- A configurable grade-band and credit-weighted GPA calculation module with unit tests
- PostgreSQL schema integration for institute, student, academic, notice, admission, session, and audit entities
- Database-backed local-password sign in with hashed, revocable sessions and role-restricted admin routes
- Student account view scoped to its linked student profile, including published grades, credit-weighted GPA/CGPA, attendance, and recorded semester fees
- Database-backed Public Institute Profile manager for leadership, departments, services, contacts, and official links

Student records are institute-scoped and persisted in PostgreSQL. Name or roll number is required to identify a student; other personal and contact fields may be left blank.

## Requirements

- Node.js 22.18 or later
- npm
- PostgreSQL for database-backed development

For local SMTP, public URL, and deployment-environment setup, see the [local release configuration guide](./docs/local-release-configuration.md).

## Run the dashboard

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database schema

This project uses PostgreSQL through `pg` and versioned SQL migrations; it has no Prisma schema/client. The checked-in migration history is 001–051. Migrations 001–027 were sourced byte-for-byte from the sibling `Results/backend/src/db/migrations` history because it contains the exact `027_university_notice_applications` predecessor required by migration 028 and the base tables/columns referenced by the subsequent migrations. The local test baseline is isolated for `amrpi_test` and is not used as the staging schema.

The staging migration runner verifies Neon project/branch identity in a read-only transaction, then rechecks identity before initializing the ledger and before each migration. It creates `public.schema_migrations` only when there are no other non-system database objects; it refuses to adopt an unknown schema or a schema with an empty/inconsistent ledger. It records each original migration version only after that migration succeeds; it does not fabricate baseline history or merge versions into a synthetic migration. The original 001–027 sequence and migrations 028–050 have been applied in order to the verified staging database after explicit approval; migration 051 is newly added and has not been applied. Migration 050 only widens the student email notification type column; it changes no row values. Production was not connected to or modified.

The migration chain is not entirely additive. For example, migration 031 updates active institute-admin accounts and pending legacy registrations and drops the admin-invites table; migration 032 drops the legacy admin-registration table. On the clean staging baseline, those two tables were created empty by migrations 029–030, so those statements affected no business records. Later migrations also backfill or seed rows when source records exist. Never run this chain against a non-empty database without reviewing its exact state.

Copy `.env.example` to `.env` to provide a PostgreSQL connection. Existing schema migrations are preserved.

The Super Admin can manage public institute content at `/admin/public-profile`. The public homepage reads the saved profile from `/api/public/profile`; migration 042 adds editable institute branding and hero titles. Profile images may be HTTPS URLs or JPEG, PNG, and WebP uploads (up to 1.5 MB per file). The editor initializes with starter content immediately and continues to allow editing if loading saved content times out.

Database changes must be tested on a separate Neon staging branch first. The migration runner never falls back to `DATABASE_URL` for its connection: it requires the dedicated, untracked `.env.staging`, verifies the Neon project and branch IDs directly from the connected server, rejects the configured production branch, and requires explicit `MIGRATION_TARGET=staging`, `ALLOW_STAGING_MIGRATIONS=true`, and `STAGING_RECOVERY_VERIFIED=true`. Keep `ALLOW_STAGING_MIGRATIONS=false` except during an explicitly approved staging migration. Set `STAGING_RECOVERY_VERIFIED=true` only after independently checking the staging branch recovery option in Neon Console. Never put the production branch URL in `STAGING_DATABASE_URL`. Production migration is not supported by this runner.

```powershell
npm run db:migrate
```

The local test database setup is a separate, guarded path restricted by `scripts/test-db-safety.ts` to `amrpi_test` on `127.0.0.1:5433.

The staging integration runner is `npm run test:staging` with `STAGING_E2E=1`. It verifies Neon staging identity, sets the app process database URL explicitly to `STAGING_DATABASE_URL`, starts Next.js in a unique temporary build directory, and routes messages only to a localhost SMTP sink that rejects non-test recipients. It requires a clean staging business-data state and cleans up only its uniquely generated synthetic records. The staging suite verifies account requests, admin authorization and decisions, first-run/bootstrap restrictions, unique roll-based Student Login IDs with collision fallback, password setup/login/reset, student profile and peer isolation, results, fees/dues, attendance, account activation/deactivation, and email failure tracking/retry. Approval email sends the login ID and a single-use password-setup link instead of a plaintext temporary password. No external email delivery was attempted; live delivery remains unverified until SMTP authentication/sender verification and a controlled inbox are available.

For manual Student Portal request testing on the explicitly verified staging branch, run `$env:STAGING_DEMO_SEED="1"; npm run db:seed:staging-demo` in PowerShell. The seed checks the configured staging project and branch, requires migration 050, refuses Production or unexpected existing records, and idempotently adds only a synthetic approved AMRPI institute and student with `.invalid` email addresses. It does not create accounts, requests, or schema changes. The test records remain until an authorized database operator removes them.

Active portal accounts can request a password-reset link from `/login`. Reset tokens are random, stored only as hashes, expire after one hour, are single-use, invalidate earlier outstanding reset links, and revoke existing sessions when a password is changed. Reset requests return the same response for existing and unknown email addresses. Configure and verify SMTP delivery before relying on password-reset email in production.

Do not commit `.env` or put production credentials in command history. Configure the deployment's trusted reverse proxy to overwrite `X-Real-IP` or `X-Forwarded-For`; login and setup throttling use that address together with the normalized email. On a new database with no users, institutes, students, or student account requests, `/` and `/login` redirect to `/setup`; the first setup submission atomically creates the single Super Admin and signs them in. Setup is rejected once any of those records exist, even if a Super Admin is missing; restoring administrator access then requires an operator-controlled recovery procedure. Public administrator signup and invitation provisioning are disabled; student account requests are reviewed by the Super Admin. The configured database retains its existing Super Admin as the sole active administrator; existing Institute Admin accounts are deactivated without deleting account records or institute/student data. Only the Super Admin can manage student records. Login uses same-origin JSON POST, an `HttpOnly`, `SameSite=Strict` cookie, opaque random session tokens stored as hashes, and an eight-hour server-side expiry. Student users can only access the student linked to their authenticated `users.student_id`. Initial Super Admin bootstrap is allowed only on a database with no users, institutes, students, or student account requests; existing data cannot be bypassed to claim the administrator role.

## Production readiness

The Student Directory uses the current database's `students`, `users`, and `admin_audit_logs` tables. Semester, department, and session year are stored directly on each student. Existing class/batch data is retained for compatibility with historical records, but the Directory no longer depends on or exposes class/batch management. The directory supports the standard polytechnic technology list, additional institute-specific departments, session filtering, and CSV/XLSX imports. Imports require a target semester and department, are capped, parsed server-side, previewed, revalidated on commit and transactional.

Attendance records are stored in the additive `035_attendance_tracking` migration. Administrators and teachers can record Present/Absent selections for every active, approved student in a semester/department, and review saved entries by date, month, semester, department, name, or roll number. The attendance history retains student name, roll, semester, and department snapshots alongside the marker and timestamps.

Exam subjects and individual published results use additive migration `036_semester_exam_results`. Migration `037_polytechnic_default_subject_catalog` adds a generated starter subject list for all eight semesters and the supported technology departments at each institute, while preserving legacy and custom subjects. Exam Results also initializes that starter catalog on demand for institutes created after the migration, and fills missing department/semester catalogs from an existing preset where possible; database-only departments receive fallback starter rows. Department matching is case-, spacing-, and slug-insensitive, and includes the standard technology list, institute-specific student/class-batch departments, and existing subject departments. These `DEF-` codes and generated titles are local defaults, not an official BTEB 2022 syllabus or BTEB-issued subject codes; verify and replace them against the institute's applicable curriculum before publishing results. Migration `038_exam_full_marks` adds an exam-specific full-mark value to published results. The result entry screen provides Final Examination, Midterm Exam, and Class Test types and records marks within the selected total. Administrators and teachers can publish results for all active, approved students in the selected semester and department. CRUD student management remains restricted to the Super Admin; deleting a student deactivates the record rather than cascading away academic history. Verify account access and review backups/retention policies before using real student information.

The Notice Board uses additive migration `039_institute_notice_board`. Administrators and teachers can publish formatted plain-text notices or image/PDF scans with a title, category, and notice date. Uploaded files are validated by MIME type and file signature, limited to 10 MB, and stored in PostgreSQL so deployment does not depend on ephemeral local disk. Published notices appear on the authenticated student portal and on a shareable public page at `/notices?instituteId=<institute-id>`; file downloads are served through the notice attachment route.

The public polytechnic portal is served at `/` for signed-out visitors and provides result search, admissions circulars, applicant status tracking, and institute notices. Public result search requires an approved polytechnic, session, semester, department, exam type, and exactly one identifier (roll, name, or registration number). The admin Notice Board can publish open admission circulars that link into the online application form. Migration `040_public_portal_applicant_accounts` adds password-hashed applicant accounts and revocable applicant sessions, and links applicants to the existing encrypted admission applications. Configure a stable, secret `ADMISSION_DATA_ENCRYPTION_KEY` containing 32 random bytes encoded as base64 (for example, generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). The same key must be retained across deployments and backups to decrypt applicant submissions; never commit it or use a different key against existing data.

Students can request access from the public homepage's **Student Portal** section. Registration is accepted only when roll, registration number, full name, and (when present in the institute record) father's name match exactly one active, approved student record. Requests are saved in `student_account_requests` and are reviewed alongside, but separately from, admission applications at `/admin/pending-requests`. Migrations `047_student_account_email_and_setup`, `048_student_fee_summaries`, `049_student_email_notification_types`, and `050_student_email_notification_type_length` are staging-only changes and require explicit approval before application. Migration 047 adds delivery tracking, rejection reasons, and password setup tokens; migration 048 adds semester fee summaries linked to existing students; migration 049 adds request receipt and password-confirmation email delivery states; migration 050 widens the notification type column to accommodate the confirmation state.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `NEXT_PUBLIC_APP_URL` in the server environment. The default example uses Gmail STARTTLS and `yeahiamondol862@gmail.com`. `SMTP_PASSWORD` must be a Google App Password; never use a normal Gmail password or expose the setting to client code. Approval creates one linked student account, assigns a unique Student Login ID, and emails that ID with a cryptographically random temporary password. Only the bcrypt hash is persisted; the student must change the temporary password on first login. If delivery fails, the authorized retry rotates the temporary password before sending again. Rejections can include an optional reason. Delivery attempts and failures remain visible in the Admin Panel, where failed messages can be retried and an administrator can send a test email to their own address. Mail failures do not undo an approval or rejection. Replace the SMTP values and sender address with the college domain values later without changing application code.

The authenticated student dashboard displays only the linked student's profile, published exam results, credit-weighted semester GPA/CGPA, recorded fee/paid/due amounts, and attendance records. The Super Admin can maintain current-term fee summaries in **Student Fees**; balances are never fabricated, and no fee is shown until a record is entered. Its digital ID generates a local QR vCard containing the student's name and phone number; scanning prompts supported phone apps to save the contact. Students can also download the `.vcf` contact file or write it to an NFC tag on a browser/device supporting Web NFC. Contact sharing is optional; the student dashboard should only be shared with trusted people.
