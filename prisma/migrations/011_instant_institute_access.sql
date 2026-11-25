ALTER TABLE institutes
  ALTER COLUMN registration_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS instant_access_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE institutes
  DROP CONSTRAINT IF EXISTS institutes_registration_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS institutes_registration_id_unique
  ON institutes (registration_id)
  WHERE registration_id IS NOT NULL;
