CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS institutes_approved_name_idx
  ON institutes (name)
  WHERE review_status = 'approved';

CREATE INDEX IF NOT EXISTS institutes_name_trgm_idx
  ON institutes USING gin (lower(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS students_active_name_trgm_idx
  ON students USING gin (full_name gin_trgm_ops)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS students_active_roll_trgm_idx
  ON students USING gin (roll_number gin_trgm_ops)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS students_active_registration_trgm_idx
  ON students USING gin (registration_number gin_trgm_ops)
  WHERE is_active AND registration_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS government_notices_title_trgm_idx
  ON government_notices USING gin (title gin_trgm_ops);
