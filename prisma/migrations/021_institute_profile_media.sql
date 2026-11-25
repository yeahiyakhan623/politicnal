ALTER TABLE institute_public_profiles
  ADD COLUMN IF NOT EXISTS logo_url varchar(2048),
  ADD COLUMN IF NOT EXISTS cover_image_url varchar(2048),
  ADD COLUMN IF NOT EXISTS website_url varchar(2048),
  ADD COLUMN IF NOT EXISTS gallery jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(gallery) = 'array');
