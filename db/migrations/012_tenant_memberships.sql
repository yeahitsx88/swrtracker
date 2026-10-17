-- Migration 012: tenant-level role memberships
-- Adds a source of truth for TENANT_ADMIN / BILLING_VIEWER resolution.

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  user_id    UUID        NOT NULL REFERENCES users(id),
  role       TEXT        NOT NULL CHECK (role IN ('TENANT_ADMIN', 'BILLING_VIEWER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_role
  ON tenant_memberships (tenant_id, role);
