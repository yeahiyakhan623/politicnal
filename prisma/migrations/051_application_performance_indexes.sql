CREATE INDEX IF NOT EXISTS students_directory_institute_term_order_idx
    ON public.students (institute_id, semester, created_at DESC, id);

CREATE INDEX IF NOT EXISTS students_directory_department_order_idx
    ON public.students (institute_id, semester, department, created_at DESC, id);

CREATE INDEX IF NOT EXISTS students_directory_session_order_idx
    ON public.students (institute_id, semester, session_year, created_at DESC, id);

CREATE INDEX IF NOT EXISTS students_active_term_department_roster_idx
    ON public.students (
        institute_id,
        semester,
        lower(regexp_replace(trim(department), '[[:space:]_-]+', ' ', 'g')),
        roll_number,
        full_name
    )
    WHERE is_active = true AND approval_status = 'approved';

CREATE INDEX IF NOT EXISTS students_public_results_roll_idx
    ON public.students (
        institute_id,
        session_year,
        semester,
        lower(trim(department)),
        lower(trim(roll_number))
    )
    WHERE is_active = true AND approval_status = 'approved';

CREATE INDEX IF NOT EXISTS students_public_results_registration_idx
    ON public.students (
        institute_id,
        session_year,
        semester,
        lower(trim(department)),
        lower(trim(registration_number))
    )
    WHERE is_active = true AND approval_status = 'approved';

CREATE INDEX IF NOT EXISTS students_active_fee_directory_idx
    ON public.students (institute_id, semester, department, roll_number, full_name, id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS students_active_department_trgm_idx
    ON public.students USING gin (department gin_trgm_ops)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS students_active_code_trgm_idx
    ON public.students USING gin (student_code gin_trgm_ops)
    WHERE is_active = true AND student_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS semester_exam_results_published_student_idx
    ON public.semester_exam_results (student_id, institute_id, exam_year DESC, published_at DESC)
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS student_account_email_deliveries_sending_attempt_idx
    ON public.student_account_email_deliveries (last_attempt_at)
    WHERE status = 'sending';
