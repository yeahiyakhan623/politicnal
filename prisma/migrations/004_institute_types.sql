ALTER TABLE institutes
  DROP CONSTRAINT IF EXISTS institutes_type_check;

ALTER TABLE institutes
  ADD CONSTRAINT institutes_type_check
  CHECK (type IN (
    'school',
    'college',
    'madrasah',
    'polytechnic',
    'technical',
    'training_center'
  ));
