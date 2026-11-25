CREATE TABLE IF NOT EXISTS public.admission_applicant_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(254) NOT NULL,
    password_hash varchar(60) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (email = lower(trim(email))),
    CHECK (length(trim(email)) BETWEEN 3 AND 254)
);

CREATE UNIQUE INDEX IF NOT EXISTS admission_applicant_accounts_email_unique
    ON public.admission_applicant_accounts (lower(email));

CREATE TABLE IF NOT EXISTS public.admission_applicant_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.admission_applicant_accounts(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admission_applicant_sessions_active_idx
    ON public.admission_applicant_sessions (account_id, expires_at)
    WHERE revoked_at IS NULL;

ALTER TABLE public.institute_admission_applications
    ADD COLUMN IF NOT EXISTS applicant_account_id uuid
        REFERENCES public.admission_applicant_accounts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS institute_admission_applications_account_notice_unique
    ON public.institute_admission_applications (applicant_account_id, notice_id)
    WHERE applicant_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS institute_admission_applications_account_status_idx
    ON public.institute_admission_applications (applicant_account_id, submitted_at DESC)
    WHERE applicant_account_id IS NOT NULL;
