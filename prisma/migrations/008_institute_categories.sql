ALTER TABLE institutes
  ADD COLUMN IF NOT EXISTS category varchar(40);

UPDATE institutes
SET category = CASE
  WHEN type = 'college' THEN 'college'
  WHEN type IN ('polytechnic', 'technical') THEN 'polytechnic'
  WHEN type IN ('school', 'madrasah') THEN 'high_school'
  ELSE NULL
END
WHERE category IS NULL;

ALTER TABLE institutes
  ADD CONSTRAINT institutes_category_check
  CHECK (category IS NULL OR category IN (
    'primary_school',
    'high_school',
    'college',
    'university',
    'polytechnic'
  ));
