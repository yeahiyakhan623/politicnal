CREATE TABLE IF NOT EXISTS government_notice_sync_state (
  source_name varchar(120) PRIMARY KEY,
  last_synced_at timestamptz NOT NULL
);
