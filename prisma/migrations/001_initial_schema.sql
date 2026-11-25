CREATE TABLE IF NOT EXISTS institutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,
  type varchar(40) NOT NULL CHECK (type IN ('school', 'college', 'polytechnic', 'training_center')),
  official_email varchar(254) NOT NULL UNIQUE,
  registration_id varchar(80) NOT NULL UNIQUE,
  address varchar(500),
  district varchar(100),
  upazila varchar(100),
  review_status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  email varchar(254) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role varchar(30) NOT NULL DEFAULT 'institute_admin'
    CHECK (role IN ('super_admin', 'institute_admin', 'institute_staff')),
  institute_id uuid REFERENCES institutes(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'super_admin' AND institute_id IS NULL) OR
         (role <> 'super_admin' AND institute_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_one_super_admin
  ON users (role) WHERE role = 'super_admin';
CREATE INDEX IF NOT EXISTS users_institute_role_idx ON users (institute_id, role);
ALTER TABLE institutes DROP CONSTRAINT IF EXISTS institutes_reviewed_by_fkey;
ALTER TABLE institutes ADD CONSTRAINT institutes_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS class_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id uuid NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  section varchar(40),
  academic_year varchar(9) NOT NULL CHECK (academic_year ~ '^[0-9]{4}(-[0-9]{4})?$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (institute_id, name, section, academic_year)
);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id uuid NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  class_batch_id uuid NOT NULL REFERENCES class_batches(id) ON DELETE CASCADE,
  full_name varchar(180) NOT NULL,
  roll_number varchar(40) NOT NULL,
  registration_number varchar(80),
  guardian_name varchar(180),
  date_of_birth date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institute_id, class_batch_id, roll_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS students_registration_number_unique
  ON students (institute_id, registration_number) WHERE registration_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS students_institute_name_idx ON students (institute_id, full_name);

CREATE TABLE IF NOT EXISTS results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_code uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  institute_id uuid NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  class_batch_id uuid NOT NULL REFERENCES class_batches(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year varchar(9) NOT NULL CHECK (academic_year ~ '^[0-9]{4}(-[0-9]{4})?$'),
  exam_type varchar(20) NOT NULL
    CHECK (exam_type IN ('mid_term', 'final', 'semester', 'module', 'other')),
  exam_name varchar(120) NOT NULL,
  marks jsonb NOT NULL CHECK (jsonb_typeof(marks) = 'array' AND jsonb_array_length(marks) > 0),
  total_full_marks numeric(12, 2) NOT NULL DEFAULT 0,
  total_obtained_marks numeric(12, 2) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'unpublished')),
  published_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institute_id, student_id, academic_year, exam_type, exam_name)
);
CREATE INDEX IF NOT EXISTS results_institute_class_status_year_idx
  ON results (institute_id, class_batch_id, status, academic_year);

CREATE TABLE IF NOT EXISTS notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id uuid NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  title varchar(180) NOT NULL,
  body varchar(10000) NOT NULL,
  published_at timestamptz,
  expires_at timestamptz,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notices_institute_published_date_idx
  ON notices (institute_id, is_published, published_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id uuid NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  period_start timestamptz,
  period_end timestamptz,
  amount_minor_units bigint NOT NULL CHECK (amount_minor_units >= 0),
  currency varchar(3) NOT NULL DEFAULT 'BDT' CHECK (currency = 'BDT'),
  payment_provider varchar(20) NOT NULL
    CHECK (payment_provider IN ('bkash', 'nagad', 'rocket', 'bank_transfer')),
  payment_reference varchar(160),
  sender_phone varchar(24) NOT NULL,
  is_legacy_payment boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded')),
  verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  review_note varchar(1000),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'paid' AND period_start IS NOT NULL AND period_end > period_start)
      OR status <> 'paid')
);
CREATE INDEX IF NOT EXISTS subscriptions_institute_status_period_idx
  ON subscriptions (institute_id, status, period_end DESC);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_pending_per_institute
  ON subscriptions (institute_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_unique_payment_reference
  ON subscriptions (payment_provider, payment_reference) WHERE payment_reference IS NOT NULL;
