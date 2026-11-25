CREATE TABLE IF NOT EXISTS public.eduportal_admin_invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    email text NOT NULL,
    token_hash char(64) NOT NULL UNIQUE,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    used_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT eduportal_admin_invites_email_valid CHECK (email = lower(trim(email))),
    CONSTRAINT eduportal_admin_invites_expiry_valid CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS eduportal_admin_invites_email_pending_idx
    ON public.eduportal_admin_invites (lower(email), expires_at)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS eduportal_admin_invites_institute_created_idx
    ON public.eduportal_admin_invites (institute_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique
    ON public.users (lower(trim(email)));
