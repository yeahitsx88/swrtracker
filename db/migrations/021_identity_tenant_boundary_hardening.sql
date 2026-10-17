-- Migration 021: Identity tenant-boundary hardening
-- Enforces tenant/company consistency for users created through registration.

ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_tenant_id_id_key;

ALTER TABLE companies
  ADD CONSTRAINT companies_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_company_id_fkey;

ALTER TABLE users
  ADD CONSTRAINT users_tenant_company_fkey
  FOREIGN KEY (tenant_id, company_id)
  REFERENCES companies (tenant_id, id);
