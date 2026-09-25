-- Phase 3 company lifecycle foundation. Existing companies remain active.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'companies'::regclass
      AND conname = 'companies_status_check'
  ) THEN
    ALTER TABLE companies ADD CONSTRAINT companies_status_check
      CHECK (status IN ('ACTIVE', 'INACTIVE'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  company_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, company_id),
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects (id, tenant_id),
  FOREIGN KEY (company_id, tenant_id) REFERENCES companies (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS project_companies_tenant_company_idx
  ON project_companies (tenant_id, company_id);
