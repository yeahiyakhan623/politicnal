ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS notice_type varchar(20) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS application_deadline date;

ALTER TABLE notices
  ADD CONSTRAINT notices_notice_type_check
  CHECK (notice_type IN ('general', 'admission'));

CREATE UNIQUE INDEX IF NOT EXISTS notices_admission_institute_identity_unique
  ON notices (id, institute_id);

CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id uuid NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name varchar(180) NOT NULL,
  department varchar(120) NOT NULL,
  phone varchar(24) NOT NULL,
  email varchar(254) NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teachers_institute_name_idx
  ON teachers (institute_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS teachers_institute_email_unique
  ON teachers (institute_id, lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS class_batches_institute_identity_unique
  ON class_batches (id, institute_id);

CREATE UNIQUE INDEX IF NOT EXISTS students_attendance_identity_unique
  ON students (id, institute_id, class_batch_id);

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id uuid NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  class_batch_id uuid NOT NULL,
  student_id uuid NOT NULL,
  attendance_date date NOT NULL,
  status varchar(10) NOT NULL CHECK (status IN ('present', 'absent')),
  marked_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date),
  FOREIGN KEY (class_batch_id, institute_id)
    REFERENCES class_batches(id, institute_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id, institute_id, class_batch_id)
    REFERENCES students(id, institute_id, class_batch_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS attendance_institute_class_date_idx
  ON attendance_records (institute_id, class_batch_id, attendance_date);

CREATE TABLE IF NOT EXISTS institute_admission_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id varchar(64) NOT NULL UNIQUE,
  institute_id uuid NOT NULL,
  notice_id uuid NOT NULL,
  applicant_data_encrypted bytea NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'accepted', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (notice_id, institute_id)
    REFERENCES notices(id, institute_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS institute_admission_applications_queue_idx
  ON institute_admission_applications (institute_id, notice_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS institute_admission_application_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL
    REFERENCES institute_admission_applications(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event varchar(30) NOT NULL CHECK (event IN ('viewed_details')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS institute_admission_application_access_logs_app_idx
  ON institute_admission_application_access_logs (application_id, created_at DESC);
