CREATE TABLE IF NOT EXISTS auth_login_rate_limits (
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_auth_login_rate_limits_blocked_until
  ON auth_login_rate_limits (blocked_until);

CREATE INDEX IF NOT EXISTS idx_auth_login_rate_limits_updated_at
  ON auth_login_rate_limits (updated_at);
