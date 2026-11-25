CREATE TABLE IF NOT EXISTS public.eduportal_admin_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(160) NOT NULL,
    email text NOT NULL,
    password_hash text,
    status varchar(16) NOT NULL DEFAULT 'pending',
    requested_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
    reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    institute_id uuid REFERENCES public.institutes(id) ON DELETE SET NULL,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT eduportal_admin_registrations_email_valid CHECK (email = lower(trim(email))),
    CONSTRAINT eduportal_admin_registrations_status_valid CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    CONSTRAINT eduportal_admin_registrations_review_valid CHECK (
        (status = 'pending' AND password_hash IS NOT NULL AND reviewed_at IS NULL AND user_id IS NULL AND institute_id IS NULL)
        OR
        (status = 'approved' AND password_hash IS NULL AND reviewed_at IS NOT NULL AND user_id IS NOT NULL AND institute_id IS NOT NULL)
        OR
        (status IN ('rejected', 'expired') AND password_hash IS NULL AND reviewed_at IS NOT NULL AND user_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS eduportal_admin_registrations_email_pending_unique
    ON public.eduportal_admin_registrations (lower(email))
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS eduportal_admin_registrations_pending_requested_idx
    ON public.eduportal_admin_registrations (requested_at DESC)
    WHERE status = 'pending';
