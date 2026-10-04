-- Tenant-wide names backed exclusively by the existing Requester/Viewer roles.
-- Existing memberships and historical evidence are not rewritten by this migration.
CREATE TABLE tenant_custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  normalized_name TEXT GENERATED ALWAYS AS
    (lower(regexp_replace(btrim(name), '[[:space:]_-]+', ' ', 'g'))) STORED,
  base_role TEXT NOT NULL CHECK (base_role IN ('REQUESTER','VIEWER')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,normalized_name),
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id),
  CHECK (normalized_name NOT IN ('tenant admin','central it','billing viewer','requester',
    'project admin','survey manager','survey superintendent','party chief','instrument man',
    'cad technician','cad lead','department manager','department lead','viewer','area viewer',
    'subcontracts coordinator'))
);
ALTER TABLE project_memberships ADD COLUMN custom_role_id UUID REFERENCES tenant_custom_roles(id) ON DELETE RESTRICT;
CREATE INDEX project_membership_custom_role ON project_memberships(custom_role_id) WHERE custom_role_id IS NOT NULL;

CREATE FUNCTION check_custom_role_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE catalog_tenant UUID; project_tenant UUID; template_role TEXT;
BEGIN
  IF NEW.custom_role_id IS NULL THEN RETURN NEW; END IF;
  SELECT tenant_id,base_role INTO catalog_tenant,template_role FROM tenant_custom_roles WHERE id=NEW.custom_role_id;
  SELECT tenant_id INTO project_tenant FROM projects WHERE id=NEW.project_id;
  IF catalog_tenant IS NULL OR catalog_tenant IS DISTINCT FROM project_tenant THEN
    RAISE EXCEPTION 'Custom role belongs to a different tenant' USING ERRCODE='23503';
  END IF;
  -- An explicit transition to a system survey role drops the old display alias.
  IF TG_OP='UPDATE' AND NEW.role IS DISTINCT FROM OLD.role AND NEW.custom_role_id IS NOT DISTINCT FROM OLD.custom_role_id
    AND NEW.role IS DISTINCT FROM template_role THEN NEW.custom_role_id=NULL; RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM template_role THEN
    RAISE EXCEPTION 'Custom role must inherit its template exactly' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER custom_role_membership BEFORE INSERT OR UPDATE ON project_memberships
  FOR EACH ROW EXECUTE FUNCTION check_custom_role_membership();
