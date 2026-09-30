-- Generic, account-independent reset request throttling. Keys are SHA-256
-- digests; do not persist requested email addresses or network identifiers.
CREATE TABLE IF NOT EXISTS auth_password_reset_rate_limits (
  scope_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_password_reset_rate_limits_updated_at
  ON auth_password_reset_rate_limits (updated_at);
