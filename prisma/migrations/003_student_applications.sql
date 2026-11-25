CREATE TABLE IF NOT EXISTS student_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id varchar(64) NOT NULL UNIQUE,
  category varchar(40) NOT NULL CHECK (category IN (
    'school_admission',
    'xi_college_admission',
    'board_transfer',
    'polytechnic_diploma',
    'university_admission',
    'exam_form_fillup',
    'custom_govt_form'
  )),
  exam_name varchar(180) NOT NULL,
  student_data_encrypted bytea NOT NULL,
  photo_encrypted bytea NOT NULL,
  documents_encrypted bytea NOT NULL,
  roll_lookup_hash bytea NOT NULL,
  registration_lookup_hash bytea NOT NULL,
  choices jsonb NOT NULL CHECK (
    jsonb_typeof(choices) = 'array'
    AND jsonb_array_length(choices) BETWEEN 1 AND 5
  ),
  status varchar(30) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_verification', 'payment_verified', 'approved', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_applications_queue_idx
  ON student_applications (status, submitted_at);

CREATE TABLE IF NOT EXISTS student_application_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES student_applications(id) ON DELETE CASCADE,
  status varchar(30) NOT NULL
    CHECK (status IN ('submitted', 'under_verification', 'payment_verified', 'approved', 'rejected')),
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_application_history_application_idx
  ON student_application_history (application_id, created_at);

CREATE TABLE IF NOT EXISTS student_application_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES student_applications(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event varchar(40) NOT NULL CHECK (event IN ('viewed_details')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_application_access_logs_admin_idx
  ON student_application_access_logs (application_id, created_at DESC);
