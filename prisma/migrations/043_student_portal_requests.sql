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
