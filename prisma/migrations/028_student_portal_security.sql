CREATE TABLE IF NOT EXISTS public.eduportal_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    token_version integer NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS eduportal_sessions_user_expiry_idx
    ON public.eduportal_sessions (user_id, expires_at);

CREATE INDEX IF NOT EXISTS eduportal_sessions_expiry_idx
    ON public.eduportal_sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.eduportal_login_attempts (
    key_hash char(64) PRIMARY KEY,
    window_started_at timestamptz NOT NULL DEFAULT now(),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eduportal_login_attempts_window_idx
    ON public.eduportal_login_attempts (window_started_at);

CREATE UNIQUE INDEX IF NOT EXISTS students_institute_registration_unique
    ON public.students (institute_id, lower(trim(registration_number)))
    WHERE registration_number IS NOT NULL AND trim(registration_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS students_class_roll_normalized_unique
    ON public.students (institute_id, class_batch_id, lower(trim(roll_number)));
