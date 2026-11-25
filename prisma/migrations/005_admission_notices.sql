ALTER TABLE government_notices
  DROP CONSTRAINT IF EXISTS government_notices_category_check;

ALTER TABLE government_notices
  ADD CONSTRAINT government_notices_category_check
  CHECK (category IN (
    'board', 'dshe', 'bteb', 'holidays',
    'school', 'college', 'polytechnic'
  ));

ALTER TABLE government_notices
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS government_notices_active_category_idx
  ON government_notices (category, published_at DESC)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS government_notice_sync_state (
  source_name varchar(120) PRIMARY KEY,
  last_synced_at timestamptz NOT NULL
);
