CREATE TABLE IF NOT EXISTS platform_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type varchar(30) NOT NULL
    CHECK (event_type IN ('page_view', 'result_search', 'result_view')),
  visitor_key_hash char(64) NOT NULL,
  session_key_hash char(64) NOT NULL,
  path varchar(512) NOT NULL,
  traffic_source varchar(30) NOT NULL DEFAULT 'direct'
    CHECK (traffic_source IN ('direct', 'google_organic', 'facebook', 'youtube', 'instagram', 'referral', 'other')),
  device_type varchar(20) NOT NULL DEFAULT 'unknown'
    CHECK (device_type IN ('mobile', 'tablet', 'desktop', 'unknown')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_analytics_events_type_time_idx
  ON platform_analytics_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS platform_analytics_events_visitor_time_idx
  ON platform_analytics_events (visitor_key_hash, occurred_at DESC);
CREATE INDEX IF NOT EXISTS platform_analytics_events_path_time_idx
  ON platform_analytics_events (path, occurred_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_paid_verified_date_idx
  ON subscriptions (COALESCE(verified_at, created_at))
  WHERE status = 'paid' AND currency = 'BDT';

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role varchar(30) NOT NULL,
  action varchar(80) NOT NULL,
  target_type varchar(50) NOT NULL,
  target_id varchar(120),
  before_value jsonb,
  after_value jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx
  ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_created_idx
  ON admin_audit_logs (actor_user_id, created_at DESC);
