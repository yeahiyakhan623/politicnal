ALTER TABLE public.student_account_requests
    ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE TABLE IF NOT EXISTS public.student_account_email_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES public.student_account_requests(id) ON DELETE CASCADE,
    notification_type varchar(20) NOT NULL
        CHECK (notification_type IN ('approval', 'rejection')),
    recipient varchar(254) NOT NULL,
    status varchar(12) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_error text,
    last_attempt_at timestamptz,
    sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (request_id, notification_type)
);

CREATE INDEX IF NOT EXISTS student_account_email_deliveries_status_idx
    ON public.student_account_email_deliveries (status, updated_at DESC);

INSERT INTO public.student_account_email_deliveries
    (request_id, notification_type, recipient, status, last_error, last_attempt_at, sent_at)
SELECT id, 'approval', email,
       CASE WHEN credentials_email_sent_at IS NULL THEN 'failed' ELSE 'sent' END,
       CASE WHEN credentials_email_sent_at IS NULL
            THEN 'Previous email status was not recorded. Retry to send a secure setup link.'
            ELSE NULL END,
       credentials_email_sent_at,
       credentials_email_sent_at
FROM public.student_account_requests
WHERE status = 'approved'
ON CONFLICT (request_id, notification_type) DO NOTHING;

INSERT INTO public.student_account_email_deliveries
    (request_id, notification_type, recipient, status, last_error)
SELECT id, 'rejection', email, 'failed',
       'Previous rejection notification status was not recorded.'
FROM public.student_account_requests
WHERE status = 'rejected'
ON CONFLICT (request_id, notification_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.student_password_setup_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_password_setup_tokens_user_expiry_idx
    ON public.student_password_setup_tokens (user_id, expires_at DESC)
    WHERE used_at IS NULL;
