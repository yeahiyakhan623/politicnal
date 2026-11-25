ALTER TABLE class_batches
  ADD COLUMN IF NOT EXISTS category varchar(40),
  ADD COLUMN IF NOT EXISTS department varchar(120);

UPDATE class_batches c
SET category = COALESCE(i.category, 'high_school')
FROM institutes i
WHERE i.id = c.institute_id
  AND c.category IS NULL;

ALTER TABLE class_batches
  ALTER COLUMN category SET NOT NULL,
  ADD CONSTRAINT class_batches_category_check
    CHECK (category IN (
      'primary_school',
      'high_school',
      'college',
      'university',
      'polytechnic'
    ));

ALTER TABLE class_batches
  ADD CONSTRAINT class_batches_id_institute_category_unique
    UNIQUE (id, institute_id, category);

CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id uuid NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  class_batch_id uuid NOT NULL,
  category varchar(40) NOT NULL,
  code varchar(40),
  name varchar(120) NOT NULL,
  credits numeric(5, 2) NOT NULL DEFAULT 0 CHECK (credits >= 0),
  written_full_marks numeric(8, 2) NOT NULL DEFAULT 100 CHECK (written_full_marks >= 0),
  mcq_full_marks numeric(8, 2) NOT NULL DEFAULT 0 CHECK (mcq_full_marks >= 0),
  practical_full_marks numeric(8, 2) NOT NULL DEFAULT 0 CHECK (practical_full_marks >= 0),
  pass_marks numeric(8, 2) NOT NULL DEFAULT 33 CHECK (pass_marks >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subjects_class_institute_category_fkey
    FOREIGN KEY (class_batch_id, institute_id, category)
    REFERENCES class_batches(id, institute_id, category) ON DELETE CASCADE,
  CONSTRAINT subjects_marks_breakdown_check
    CHECK (
      written_full_marks + mcq_full_marks + practical_full_marks > 0
      AND pass_marks <= written_full_marks + mcq_full_marks + practical_full_marks
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS subjects_class_name_unique
  ON subjects (class_batch_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS subjects_class_code_unique
  ON subjects (class_batch_id, lower(code))
  WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS subjects_institute_class_active_idx
  ON subjects (institute_id, class_batch_id, is_active);

ALTER TABLE results
  ADD COLUMN IF NOT EXISTS category varchar(40),
  ADD COLUMN IF NOT EXISTS gpa numeric(3, 2),
  ADD COLUMN IF NOT EXISTS grade varchar(2);

UPDATE results r
SET category = c.category
FROM class_batches c
WHERE c.id = r.class_batch_id
  AND r.category IS NULL;

ALTER TABLE results
  ALTER COLUMN category SET NOT NULL,
  ADD CONSTRAINT results_class_institute_category_fkey
    FOREIGN KEY (class_batch_id, institute_id, category)
    REFERENCES class_batches(id, institute_id, category) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS results_institute_class_exam_idx
  ON results (institute_id, class_batch_id, academic_year, exam_type, exam_name);
