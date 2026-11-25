ALTER TABLE institute_public_profiles
  ADD COLUMN IF NOT EXISTS principal_phone varchar(40),
  ADD COLUMN IF NOT EXISTS principal_email varchar(254),
  ADD COLUMN IF NOT EXISTS principal_message varchar(5000),
  ADD COLUMN IF NOT EXISTS principal_photo_url varchar(2048);
