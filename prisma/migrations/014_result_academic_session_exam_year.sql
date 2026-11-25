ALTER TABLE results
  ADD COLUMN exam_year integer;

UPDATE results r
SET exam_year = CASE
      WHEN r.academic_year ~ '^[0-9]{4}-[0-9]{4}$'
        THEN substring(r.academic_year from 6 for 4)::integer
      WHEN r.academic_year ~ '^[0-9]{4}$'
        THEN r.academic_year::integer
      ELSE extract(year FROM COALESCE(r.published_at, r.created_at))::integer
    END,
    academic_year = COALESCE(c.academic_year, r.academic_year)
FROM class_batches c
WHERE c.id = r.class_batch_id;

UPDATE results
SET exam_year = CASE
      WHEN academic_year ~ '^[0-9]{4}-[0-9]{4}$'
        THEN substring(academic_year from 6 for 4)::integer
      WHEN academic_year ~ '^[0-9]{4}$'
        THEN academic_year::integer
      ELSE extract(year FROM COALESCE(published_at, created_at))::integer
    END
WHERE exam_year IS NULL;

ALTER TABLE results
  ALTER COLUMN exam_year SET NOT NULL,
  ADD CONSTRAINT results_exam_year_valid CHECK (exam_year BETWEEN 1900 AND 9999);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM results
    GROUP BY institute_id, class_batch_id, student_id, academic_year,
             exam_year, exam_type, exam_name
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create session-scoped result identity: existing results collide after exam-year backfill. Resolve duplicates on a database branch and retry migration 014.';
  END IF;
END
$$;

ALTER TABLE results
  DROP CONSTRAINT IF EXISTS results_institute_id_student_id_academic_year_exam_type_exam_name_key;

CREATE UNIQUE INDEX results_result_identity_idx
  ON results (
    institute_id, class_batch_id, student_id, academic_year,
    exam_year, exam_type, exam_name
  ) NULLS NOT DISTINCT;
