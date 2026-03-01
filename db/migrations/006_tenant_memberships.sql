-- Migration 006: Tenant-level role memberships
-- Tenant roles are distinct from project roles per CLAUDE.md §7.

CREATE TABLE tenant_memberships (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  user_id     UUID        NOT NULL REFERENCES users(id),
  role        TEXT        NOT NULL CHECK (role IN ('TENANT_ADMIN', 'BILLING_VIEWER')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_tenant_memberships_tenant_user
  ON tenant_memberships (tenant_id, user_id);
