ALTER TABLE students
  ADD COLUMN IF NOT EXISTS student_phone varchar(40),
  ADD COLUMN IF NOT EXISTS father_phone varchar(40),
  ADD COLUMN IF NOT EXISTS email varchar(254);
