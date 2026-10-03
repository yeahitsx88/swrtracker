-- Named existing operational profiles. Definitions are immutable; no permission engine.
CREATE TABLE IF NOT EXISTS tenant_custom_roles (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id UUID NOT NULL REFERENCES tenants(id),
 name VARCHAR(80) NOT NULL CHECK(length(btrim(name))>0),
 description VARCHAR(500) NOT NULL DEFAULT '',
 base_role TEXT NOT NULL CHECK(base_role IN ('REQUESTER','SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','CAD_TECHNICIAN','CAD_LEAD','VIEWER')),
 created_by UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_custom_roles_name_unique ON tenant_custom_roles(tenant_id,lower(name));
CREATE OR REPLACE FUNCTION protect_custom_role_definition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Custom role definitions are immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER tenant_custom_roles_immutable BEFORE UPDATE OR DELETE ON tenant_custom_roles
 FOR EACH ROW EXECUTE FUNCTION protect_custom_role_definition();

ALTER TABLE project_memberships ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES tenant_custom_roles(id);
ALTER TABLE invites ADD COLUMN IF NOT EXISTS custom_role_id UUID;
ALTER TABLE invites ADD CONSTRAINT invites_custom_role_tenant_fk
 FOREIGN KEY(tenant_id,custom_role_id) REFERENCES tenant_custom_roles(tenant_id,id);

CREATE OR REPLACE FUNCTION validate_membership_custom_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Existing guarded role changes must not retain the previous custom label.
 IF TG_OP='UPDATE' AND NEW.role IS DISTINCT FROM OLD.role AND NEW.custom_role_id IS NOT DISTINCT FROM OLD.custom_role_id THEN
  NEW.custom_role_id=NULL;
 END IF;
 IF NEW.custom_role_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM tenant_custom_roles r JOIN projects p ON p.tenant_id=r.tenant_id
  WHERE p.id=NEW.project_id AND r.id=NEW.custom_role_id AND r.base_role=NEW.role
 ) THEN RAISE EXCEPTION 'Custom role must match membership tenant and permission profile' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_memberships_custom_role BEFORE INSERT OR UPDATE ON project_memberships
 FOR EACH ROW EXECUTE FUNCTION validate_membership_custom_role();
CREATE OR REPLACE FUNCTION validate_invite_custom_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.custom_role_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM tenant_custom_roles r WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.custom_role_id AND r.base_role=NEW.role
 ) THEN RAISE EXCEPTION 'Custom role must match invitation tenant and permission profile' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invites_custom_role BEFORE INSERT OR UPDATE ON invites
 FOR EACH ROW EXECUTE FUNCTION validate_invite_custom_role();
