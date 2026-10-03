-- Personal display preferences and tenant-scoped branding. No authorization roles change.
CREATE TABLE IF NOT EXISTS user_appearance (
 tenant_id UUID NOT NULL REFERENCES tenants(id), user_id UUID NOT NULL,
 mode TEXT NOT NULL CHECK (mode IN ('LIGHT','DARK','SYSTEM')), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(tenant_id,user_id), FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS tenant_appearance (
 tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
 primary_color TEXT NOT NULL CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
 accent_color TEXT NOT NULL CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$'),
 version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One preparation at a time; completed operating periods remain available.
CREATE TABLE IF NOT EXISTS project_recommissioning (
 id UUID PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), project_id UUID NOT NULL,
 replacement_admin_id UUID NOT NULL REFERENCES users(id), initiated_by UUID NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000),
 archived_evidence JSONB NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 opened_at TIMESTAMPTZ, opened_by UUID,
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
 FOREIGN KEY(tenant_id,replacement_admin_id) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,initiated_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,opened_by) REFERENCES users(tenant_id,id),
 CHECK((opened_at IS NULL)=(opened_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS project_recommissioning_pending ON project_recommissioning(tenant_id,project_id) WHERE opened_at IS NULL;

CREATE OR REPLACE FUNCTION protect_recommissioning_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Recommissioning evidence cannot be removed'; END IF;
 IF OLD.opened_at IS NOT NULL OR (to_jsonb(NEW)-'opened_at'-'opened_by') IS DISTINCT FROM (to_jsonb(OLD)-'opened_at'-'opened_by') OR NEW.opened_at IS NULL THEN
  RAISE EXCEPTION 'Only the first operating-period opening may update preparation evidence';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS recommissioning_evidence_immutable ON project_recommissioning;
CREATE TRIGGER recommissioning_evidence_immutable BEFORE UPDATE OR DELETE ON project_recommissioning FOR EACH ROW EXECUTE FUNCTION protect_recommissioning_evidence();
DROP TRIGGER IF EXISTS recommissioning_evidence_no_truncate ON project_recommissioning;
CREATE TRIGGER recommissioning_evidence_no_truncate BEFORE TRUNCATE ON project_recommissioning FOR EACH STATEMENT EXECUTE FUNCTION protect_recommissioning_evidence();
