ALTER TABLE students
  ADD COLUMN IF NOT EXISTS father_name varchar(180),
  ADD COLUMN IF NOT EXISTS mother_name varchar(180),
  ADD COLUMN IF NOT EXISTS guardian_contact varchar(40),
  ADD COLUMN IF NOT EXISTS address varchar(500);

CREATE INDEX IF NOT EXISTS students_institute_active_class_idx
  ON students (institute_id, class_batch_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS students_search_idx
  ON students USING gin (
    to_tsvector(
      'simple',
      coalesce(full_name, '') || ' ' ||
      coalesce(roll_number, '') || ' ' ||
      coalesce(registration_number, '')
    )
  );
