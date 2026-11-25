ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'institute_admin', 'institute_staff', 'student'));

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS approval_status varchar(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS student_code varchar(24),
  ADD COLUMN IF NOT EXISTS facebook_id varchar(255),
  ADD COLUMN IF NOT EXISTS photo_url varchar(300),
  ADD COLUMN IF NOT EXISTS contact_share_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE students
  ADD CONSTRAINT students_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS students_student_code_unique
  ON students (student_code)
  WHERE student_code IS NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE users
  ADD CONSTRAINT users_student_identity_check
  CHECK (
    (role = 'student' AND student_id IS NOT NULL AND institute_id IS NOT NULL)
    OR (role <> 'student' AND student_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS users_student_identity_unique
  ON users (student_id)
  WHERE role = 'student';

CREATE UNIQUE INDEX IF NOT EXISTS users_student_username_unique
  ON users (lower(username))
  WHERE role = 'student' AND username IS NOT NULL;

CREATE INDEX IF NOT EXISTS students_pending_approval_idx
  ON students (institute_id, created_at DESC)
  WHERE approval_status = 'pending';
