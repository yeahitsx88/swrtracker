-- Explicit tenant home organization; preserve historical company identities.
-- NULL until Tenant IT deliberately designates an existing internal company.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS home_company_id UUID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='tenants'::regclass AND conname='tenants_home_company_fk') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_home_company_fk
      FOREIGN KEY(id,home_company_id) REFERENCES companies(tenant_id,id);
  END IF;
END $$;
