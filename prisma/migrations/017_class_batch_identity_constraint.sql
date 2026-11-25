ALTER TABLE class_batches
  DROP CONSTRAINT IF EXISTS class_batches_institute_id_name_section_academic_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS class_batches_academic_identity_unique
  ON class_batches (
    institute_id, category, name, section, department, class_group, academic_year
  )
  NULLS NOT DISTINCT;
