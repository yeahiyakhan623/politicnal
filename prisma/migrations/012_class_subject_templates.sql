ALTER TABLE class_batches
  ADD COLUMN IF NOT EXISTS class_group varchar(40);

ALTER TABLE class_batches
  DROP CONSTRAINT IF EXISTS class_batches_institute_id_name_section_academic_year_key,
  ADD CONSTRAINT class_batches_group_check
  CHECK (
    class_group IS NULL
    OR class_group IN ('science', 'humanities', 'business_studies')
  );

CREATE UNIQUE INDEX IF NOT EXISTS class_batches_academic_identity_unique
  ON class_batches (institute_id, category, name, section, department, class_group, academic_year)
  NULLS NOT DISTINCT;
