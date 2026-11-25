CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.test_schema_migrations (
    version varchar(100) PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.institutes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(200) NOT NULL,
    slug varchar(120) NOT NULL UNIQUE,
    category varchar(50) NOT NULL DEFAULT 'polytechnic',
    type varchar(50) NOT NULL DEFAULT 'polytechnic',
    review_status varchar(20) NOT NULL DEFAULT 'approved'
        CHECK (review_status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.students (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    class_batch_id uuid,
    student_code varchar(80),
    full_name varchar(160),
    roll_number varchar(40),
    registration_number varchar(80),
    email varchar(254),
    date_of_birth date,
    guardian_name varchar(160),
    guardian_contact varchar(30),
    student_phone varchar(30),
    father_phone varchar(30),
    mother_phone varchar(30),
    address text,
    semester smallint NOT NULL DEFAULT 1 CHECK (semester BETWEEN 1 AND 8),
    department text,
    session_year varchar(20),
    is_active boolean NOT NULL DEFAULT true,
    approval_status varchar(12) NOT NULL DEFAULT 'approved'
        CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    test_source_key varchar(160) UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (NULLIF(trim(full_name), '') IS NOT NULL OR NULLIF(trim(roll_number), '') IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS students_test_registration_unique
    ON public.students (institute_id, lower(trim(registration_number)))
    WHERE registration_number IS NOT NULL AND trim(registration_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS students_test_roll_unique
    ON public.students (
        institute_id,
        semester,
        COALESCE(lower(trim(department)), ''),
        lower(trim(roll_number))
    )
    WHERE roll_number IS NOT NULL AND trim(roll_number) <> '';

CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
    name varchar(160) NOT NULL,
    email varchar(254) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role varchar(30) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    password_change_required boolean NOT NULL DEFAULT false,
    token_version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_student_link_idx
    ON public.users (student_id)
    WHERE student_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.eduportal_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    token_version integer NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.eduportal_login_attempts (
    key_hash char(64) PRIMARY KEY,
    window_started_at timestamptz NOT NULL DEFAULT now(),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    actor_role varchar(40) NOT NULL,
    action varchar(120) NOT NULL,
    target_type varchar(80) NOT NULL,
    target_id uuid,
    before_value jsonb,
    after_value jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_account_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    full_name varchar(160) NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 160),
    father_name varchar(160) NOT NULL CHECK (length(trim(father_name)) BETWEEN 2 AND 160),
    roll_number varchar(40) NOT NULL,
    registration_number varchar(60) NOT NULL,
    email varchar(254) NOT NULL,
    phone varchar(30) NOT NULL,
    status varchar(12) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    account_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    requested_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    credentials_email_sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (email = lower(trim(email))),
    CHECK (length(trim(phone)) BETWEEN 6 AND 30)
);

CREATE INDEX IF NOT EXISTS student_account_requests_pending_idx
    ON public.student_account_requests (institute_id, requested_at DESC)
    WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS student_account_requests_pending_email_unique
    ON public.student_account_requests (lower(email))
    WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS student_account_requests_pending_student_unique
    ON public.student_account_requests (institute_id, student_id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS student_account_requests_account_idx
    ON public.student_account_requests (account_user_id)
    WHERE account_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    title text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.institute_admission_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    notice_id uuid NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
    tracking_id varchar(80) NOT NULL,
    status varchar(30) NOT NULL DEFAULT 'submitted',
    submitted_at timestamptz NOT NULL DEFAULT now(),
    applicant_data_encrypted bytea NOT NULL
);

CREATE TABLE IF NOT EXISTS public.semester_subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    name text NOT NULL,
    code varchar(40)
);

CREATE TABLE IF NOT EXISTS public.semester_exam_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.semester_subjects(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    exam_name text NOT NULL,
    exam_year integer NOT NULL,
    marks numeric(8,2),
    exam_full_marks numeric(8,2) NOT NULL DEFAULT 100,
    grade_point numeric(4,2),
    letter_grade varchar(8),
    status varchar(20) NOT NULL DEFAULT 'draft',
    published_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    attendance_date date NOT NULL,
    status varchar(12) NOT NULL CHECK (status IN ('present', 'absent')),
    department text NOT NULL DEFAULT '',
    semester smallint NOT NULL DEFAULT 1 CHECK (semester BETWEEN 1 AND 8),
    marked_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.test_schema_migrations (version)
VALUES ('baseline-for-044-to-046-only')
ON CONFLICT (version) DO NOTHING;
