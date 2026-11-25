ALTER TABLE public.attendance_records
    ADD COLUMN IF NOT EXISTS semester smallint,
    ADD COLUMN IF NOT EXISTS department text,
    ADD COLUMN IF NOT EXISTS student_name text,
    ADD COLUMN IF NOT EXISTS roll_number varchar(40),
    ADD COLUMN IF NOT EXISTS marked_at timestamptz;

UPDATE public.attendance_records a
SET semester = COALESCE(
        (regexp_match(b.name, '([1-8])(?:st|nd|rd|th)?[[:space:]]*semester', 'i'))[1]::smallint,
        s.semester,
        1
    ),
    department = COALESCE(
        NULLIF(trim(s.department), ''),
        NULLIF(trim(b.department), ''),
        'Unspecified'
    ),
    student_name = s.full_name,
    roll_number = s.roll_number,
    marked_at = COALESCE(a.marked_at, a.created_at, now())
FROM public.students s
LEFT JOIN public.class_batches b
    ON b.id = s.class_batch_id
   AND b.institute_id = s.institute_id
WHERE s.id = a.student_id
  AND s.institute_id = a.institute_id;

ALTER TABLE public.attendance_records
    ALTER COLUMN class_batch_id DROP NOT NULL,
    ALTER COLUMN semester SET NOT NULL,
    ALTER COLUMN department SET NOT NULL,
    ALTER COLUMN marked_at SET DEFAULT now(),
    ALTER COLUMN marked_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.attendance_records'::regclass
          AND conname = 'attendance_records_semester_range_check'
    ) THEN
        ALTER TABLE public.attendance_records
            ADD CONSTRAINT attendance_records_semester_range_check CHECK (semester BETWEEN 1 AND 8);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.attendance_records'::regclass
          AND conname = 'attendance_records_department_check'
    ) THEN
        ALTER TABLE public.attendance_records
            ADD CONSTRAINT attendance_records_department_check CHECK (length(trim(department)) BETWEEN 1 AND 100);
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_institute_student_date_unique
    ON public.attendance_records (institute_id, student_id, attendance_date);

CREATE INDEX IF NOT EXISTS attendance_records_directory_history_idx
    ON public.attendance_records (institute_id, attendance_date DESC, semester, department);
