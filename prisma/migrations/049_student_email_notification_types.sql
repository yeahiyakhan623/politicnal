ALTER TABLE public.student_account_email_deliveries
    DROP CONSTRAINT IF EXISTS student_account_email_deliveries_notification_type_check;

ALTER TABLE public.student_account_email_deliveries
    ADD CONSTRAINT student_account_email_deliveries_notification_type_check
    CHECK (notification_type IN (
        'request_received',
        'approval',
        'rejection',
        'password_setup_confirmation'
    ));

CREATE INDEX IF NOT EXISTS student_account_email_deliveries_request_status_idx
    ON public.student_account_email_deliveries (request_id, status, notification_type);
