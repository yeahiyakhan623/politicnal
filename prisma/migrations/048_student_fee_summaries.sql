CREATE TABLE IF NOT EXISTS public.student_fee_summaries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id uuid NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    session_year varchar(20) NOT NULL CHECK (length(trim(session_year)) BETWEEN 1 AND 20),
    semester smallint NOT NULL CHECK (semester BETWEEN 1 AND 8),
    fee_amount numeric(10,2) NOT NULL CHECK (fee_amount >= 0),
    paid_amount numeric(10,2) NOT NULL DEFAULT 0
        CHECK (paid_amount >= 0 AND paid_amount <= fee_amount),
    updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (student_id, session_year, semester)
);

CREATE INDEX IF NOT EXISTS student_fee_summaries_institute_term_idx
    ON public.student_fee_summaries (institute_id, session_year, semester);
