-- Migration 014: add password reset token storage

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  user_id     UUID        NOT NULL REFERENCES users(id),
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_tenant_user_active
  ON password_reset_tokens (tenant_id, user_id)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
  ON password_reset_tokens (expires_at);
