ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS semester smallint,
    ADD COLUMN IF NOT EXISTS department text,
    ADD COLUMN IF NOT EXISTS mother_phone varchar(30);

UPDATE public.students s
SET semester = COALESCE(
        (regexp_match(b.name, '([1-8])(?:st|nd|rd|th)?[[:space:]]*semester', 'i'))[1]::smallint,
        1
    ),
    department = COALESCE(s.department, b.department)
FROM public.class_batches b
WHERE b.id = s.class_batch_id
  AND b.institute_id = s.institute_id
  AND s.semester IS NULL;

UPDATE public.students
SET semester = 1
WHERE semester IS NULL;

ALTER TABLE public.students
    ALTER COLUMN semester SET DEFAULT 1,
    ALTER COLUMN semester SET NOT NULL,
    ALTER COLUMN class_batch_id DROP NOT NULL,
    ALTER COLUMN full_name DROP NOT NULL,
    ALTER COLUMN roll_number DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.students'::regclass
          AND conname = 'students_semester_range_check'
    ) THEN
        ALTER TABLE public.students
            ADD CONSTRAINT students_semester_range_check CHECK (semester BETWEEN 1 AND 8);
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.students'::regclass
          AND conname = 'students_name_or_roll_check'
    ) THEN
        ALTER TABLE public.students
            ADD CONSTRAINT students_name_or_roll_check
            CHECK (NULLIF(trim(full_name), '') IS NOT NULL OR NULLIF(trim(roll_number), '') IS NOT NULL);
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS students_directory_roll_unique
    ON public.students (
        institute_id,
        semester,
        COALESCE(lower(trim(department)), ''),
        lower(trim(roll_number))
    )
    WHERE roll_number IS NOT NULL AND trim(roll_number) <> '';

CREATE INDEX IF NOT EXISTS students_directory_semester_department_idx
    ON public.students (institute_id, semester, department);
