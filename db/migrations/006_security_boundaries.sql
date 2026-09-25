-- Security boundary alignment for the current tenant and workflow model.
-- The migration runner applies this file in one transaction.

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('TENANT_ADMIN', 'BILLING_VIEWER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

INSERT INTO tenant_memberships (tenant_id, user_id, role)
SELECT DISTINCT p.tenant_id, pm.user_id, 'TENANT_ADMIN'
FROM project_memberships pm
JOIN projects p ON p.id = pm.project_id
JOIN users u ON u.id = pm.user_id AND u.tenant_id = p.tenant_id
WHERE pm.role = 'TENANT_ADMIN'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'SETUP';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- The old Survey Lead owns the closest current manager role. An ambiguous
-- multi-lead project needs an explicit owner decision instead of a silent grant.
DO $$
BEGIN
  IF EXISTS (
    SELECT project_id FROM project_memberships
    WHERE role = 'SURVEY_LEAD'
    GROUP BY project_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple legacy SURVEY_LEAD members require manual Survey Manager selection';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION deny_ticket_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit event log is append-only';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ticket_events_append_only') THEN
    CREATE TRIGGER ticket_events_append_only
      BEFORE UPDATE OR DELETE ON ticket_events
      FOR EACH ROW EXECUTE FUNCTION deny_ticket_event_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ticket_events_no_truncate') THEN
    CREATE TRIGGER ticket_events_no_truncate
      BEFORE TRUNCATE ON ticket_events
      FOR EACH STATEMENT EXECUTE FUNCTION deny_ticket_event_mutation();
  END IF;
END $$;

ALTER TABLE project_memberships DROP CONSTRAINT IF EXISTS project_memberships_role_check;

UPDATE project_memberships SET role = 'SURVEY_MANAGER' WHERE role = 'SURVEY_LEAD';
-- APPROVER is retired. Keep its former project read access without approval authority.
UPDATE project_memberships SET role = 'VIEWER' WHERE role = 'APPROVER';

ALTER TABLE project_memberships ADD CONSTRAINT project_memberships_role_check
  CHECK (role IN (
    'PROJECT_ADMIN', 'REQUESTER', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT',
    'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD',
    'VIEWER', 'AREA_VIEWER'
  ));

-- Composite keys preserve ownership relationships for all new writes.
CREATE UNIQUE INDEX IF NOT EXISTS companies_id_tenant_uq ON companies (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_id_tenant_uq ON users (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS projects_id_tenant_uq ON projects (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS areas_id_project_tenant_uq ON areas (id, project_id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS subareas_id_area_project_tenant_uq ON subareas (id, area_id, project_id, tenant_id);

ALTER TABLE allowed_domains ADD COLUMN IF NOT EXISTS company_id UUID;
-- A tenant with one company has an unambiguous historical mapping. Other
-- domains remain unbound until a tenant administrator assigns them.
UPDATE allowed_domains ad SET company_id = (
  SELECT c.id FROM companies c WHERE c.tenant_id = ad.tenant_id LIMIT 1
)
WHERE ad.company_id IS NULL AND (
  SELECT COUNT(*) FROM companies c WHERE c.tenant_id = ad.tenant_id
) = 1;

CREATE TABLE IF NOT EXISTS tenant_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  actor_id UUID NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_events_append_only') THEN
    CREATE TRIGGER tenant_events_append_only
      BEFORE UPDATE OR DELETE ON tenant_events
      FOR EACH ROW EXECUTE FUNCTION deny_ticket_event_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_events_no_truncate') THEN
    CREATE TRIGGER tenant_events_no_truncate
      BEFORE TRUNCATE ON tenant_events
      FOR EACH STATEMENT EXECUTE FUNCTION deny_ticket_event_mutation();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS allowed_domains_company_lookup
  ON allowed_domains (tenant_id, company_id, LOWER(domain));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_company_tenant_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_company_tenant_fk
      FOREIGN KEY (company_id, tenant_id) REFERENCES companies (id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_memberships_user_tenant_fk') THEN
    ALTER TABLE tenant_memberships ADD CONSTRAINT tenant_memberships_user_tenant_fk
      FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allowed_domains_company_tenant_fk') THEN
    ALTER TABLE allowed_domains ADD CONSTRAINT allowed_domains_company_tenant_fk
      FOREIGN KEY (company_id, tenant_id) REFERENCES companies (id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'areas_project_tenant_fk') THEN
    ALTER TABLE areas ADD CONSTRAINT areas_project_tenant_fk
      FOREIGN KEY (project_id, tenant_id) REFERENCES projects (id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subareas_area_project_tenant_fk') THEN
    ALTER TABLE subareas ADD CONSTRAINT subareas_area_project_tenant_fk
      FOREIGN KEY (area_id, project_id, tenant_id) REFERENCES areas (id, project_id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_project_tenant_fk') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_project_tenant_fk
      FOREIGN KEY (project_id, tenant_id) REFERENCES projects (id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_area_project_tenant_fk') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_area_project_tenant_fk
      FOREIGN KEY (area_id, project_id, tenant_id) REFERENCES areas (id, project_id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_subarea_area_project_tenant_fk') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_subarea_area_project_tenant_fk
      FOREIGN KEY (subarea_id, area_id, project_id, tenant_id)
      REFERENCES subareas (id, area_id, project_id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_company_tenant_fk') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_company_tenant_fk
      FOREIGN KEY (company_id, tenant_id) REFERENCES companies (id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_requester_tenant_fk') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_requester_tenant_fk
      FOREIGN KEY (requester_id, tenant_id) REFERENCES users (id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_party_chief_tenant_fk') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_party_chief_tenant_fk
      FOREIGN KEY (assigned_party_chief_id, tenant_id) REFERENCES users (id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_instrument_man_tenant_fk') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_instrument_man_tenant_fk
      FOREIGN KEY (assigned_instrument_man_id, tenant_id) REFERENCES users (id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_survey_lead_tenant_fk') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_survey_lead_tenant_fk
      FOREIGN KEY (survey_lead_id, tenant_id) REFERENCES users (id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_events_actor_tenant_fk') THEN
    ALTER TABLE tenant_events ADD CONSTRAINT tenant_events_actor_tenant_fk
      FOREIGN KEY (actor_id, tenant_id) REFERENCES users (id, tenant_id) NOT VALID;
  END IF;
END $$;
