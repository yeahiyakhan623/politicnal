ALTER TABLE government_notices
  DROP CONSTRAINT IF EXISTS government_notices_category_check;

ALTER TABLE government_notices
  ADD CONSTRAINT government_notices_category_check
  CHECK (category IN (
    'board', 'dshe', 'bteb', 'holidays',
    'school', 'college', 'polytechnic', 'university'
  ));

ALTER TABLE student_applications
  ADD COLUMN IF NOT EXISTS notice_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
