CREATE TABLE IF NOT EXISTS institute_public_profiles (
  institute_id uuid PRIMARY KEY REFERENCES institutes(id) ON DELETE CASCADE,
  display_name varchar(180),
  full_address varchar(1000),
  contact_phone varchar(40),
  contact_email varchar(254),
  principal_name varchar(180),
  history text,
  facilities text,
  description text,
  teachers jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(teachers) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
