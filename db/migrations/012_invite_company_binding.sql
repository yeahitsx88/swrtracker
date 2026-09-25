-- Existing invites lack a trustworthy company association. Keep them for history,
-- but application acceptance requires a bound company; administrators reissue them.
ALTER TABLE invites ADD COLUMN IF NOT EXISTS company_id UUID;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'invites'::regclass AND conname = 'invites_company_tenant_fk') THEN
    ALTER TABLE invites ADD CONSTRAINT invites_company_tenant_fk
      FOREIGN KEY (company_id, tenant_id) REFERENCES companies (id, tenant_id) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION require_invite_company_on_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'new invites must bind a company';
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'invites_require_company_insert') THEN
    CREATE TRIGGER invites_require_company_insert
      BEFORE INSERT ON invites FOR EACH ROW
      EXECUTE FUNCTION require_invite_company_on_insert();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invites_pending_email_idx
  ON invites (tenant_id, project_id, LOWER(email), created_at DESC)
  WHERE accepted_at IS NULL AND canceled_at IS NULL;
