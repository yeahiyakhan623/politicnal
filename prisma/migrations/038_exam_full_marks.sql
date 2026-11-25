ALTER TABLE public.semester_exam_results
    ADD COLUMN IF NOT EXISTS exam_full_marks numeric(7,2);

UPDATE public.semester_exam_results AS result
SET exam_full_marks = subject.maximum_marks
FROM public.semester_subjects AS subject
WHERE result.subject_id = subject.id
  AND result.exam_full_marks IS NULL;

ALTER TABLE public.semester_exam_results
    ALTER COLUMN exam_full_marks SET DEFAULT 100,
    ALTER COLUMN exam_full_marks SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.semester_exam_results'::regclass
          AND conname = 'semester_exam_results_full_marks_positive'
    ) THEN
        ALTER TABLE public.semester_exam_results
            ADD CONSTRAINT semester_exam_results_full_marks_positive
            CHECK (exam_full_marks > 0);
    END IF;
END
$$;
