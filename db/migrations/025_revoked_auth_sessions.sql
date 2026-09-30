-- A logout revokes only the presented bearer token, not other account sessions.
CREATE TABLE IF NOT EXISTS revoked_auth_sessions (
  token_hash TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revoked_auth_sessions_expires_at
  ON revoked_auth_sessions (expires_at);
