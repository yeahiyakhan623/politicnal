WITH disabled_admins AS (
    UPDATE public.users
    SET is_active = false,
        updated_at = now()
    WHERE role = 'institute_admin'
      AND is_active = true
    RETURNING id, institute_id, email
)
INSERT INTO public.admin_audit_logs
    (actor_user_id, actor_role, action, target_type, target_id, after_value)
SELECT NULL, 'system', 'auth.institute_admin_disabled', 'user', id::text,
       jsonb_build_object('instituteId', institute_id, 'email', email, 'reason', 'single_super_admin_setup')
FROM disabled_admins;

INSERT INTO public.admin_audit_logs
    (actor_user_id, actor_role, action, target_type, target_id, after_value)
SELECT NULL, 'system', 'auth.admin_registration_closed', 'admin_registration', id::text,
       jsonb_build_object('email', email, 'reason', 'single_super_admin_setup')
FROM public.eduportal_admin_registrations
WHERE status = 'pending';

UPDATE public.eduportal_admin_registrations
SET status = 'rejected',
    password_hash = NULL,
    reviewed_at = now()
WHERE status = 'pending';

DROP TABLE public.eduportal_admin_invites;
