ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_change_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_active_idx
  ON password_reset_tokens (user_id, expires_at)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS password_management_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id uuid REFERENCES institutes(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type varchar(40) NOT NULL
    CHECK (event_type IN (
      'admin_reset',
      'temporary_password',
      'reset_email',
      'forgot_password',
      'self_service_reset',
      'forced_password_change'
    )),
  outcome varchar(20) NOT NULL CHECK (outcome IN ('success', 'failure')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_management_audit_institute_created_idx
  ON password_management_audit (institute_id, created_at DESC);
