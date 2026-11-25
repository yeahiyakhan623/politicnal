ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS session_year varchar(20);

UPDATE public.students s
SET session_year = COALESCE(
    regexp_replace(b.academic_year, '^([0-9]{4})-[0-9]{2}([0-9]{2})$', '\1-\2'),
    regexp_replace(b.academic_year, '^([0-9]{4})-([0-9]{4})$', '\1-\2'),
    regexp_replace(b.academic_year, '^([0-9]{4})$', '\1')
)
FROM public.class_batches b
WHERE b.id = s.class_batch_id
  AND b.institute_id = s.institute_id
  AND s.session_year IS NULL;

CREATE INDEX IF NOT EXISTS students_directory_session_idx
    ON public.students (institute_id, session_year);
