ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_users_tenant_user_active_session
  ON users (tenant_id, id, session_version)
  WHERE deactivated_at IS NULL;
