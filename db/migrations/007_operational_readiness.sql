-- Operational project readiness, AOR hierarchy, and current cancellation state.
-- Applied as one transaction by db/migrate.ts. Legacy area rows remain readable.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS crew_build TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS activated_by UUID REFERENCES users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id);
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_crew_build_check;
ALTER TABLE projects ADD CONSTRAINT projects_crew_build_check
  CHECK (crew_build IN ('FULL', 'MEDIUM', 'SLIM'));
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('SETUP', 'ACTIVE', 'ARCHIVED'));

ALTER TABLE project_memberships ADD COLUMN IF NOT EXISTS designated_acting_for TEXT;
ALTER TABLE project_memberships DROP CONSTRAINT IF EXISTS project_memberships_role_check;
UPDATE project_memberships SET role = 'DEPARTMENT_MANAGER' WHERE role = 'DISCIPLINE_MANAGER';
UPDATE project_memberships SET role = 'DEPARTMENT_LEAD' WHERE role = 'DISCIPLINE_LEAD';
ALTER TABLE project_memberships ADD CONSTRAINT project_memberships_role_check
  CHECK (role IN (
    'PROJECT_ADMIN', 'REQUESTER', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT',
    'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD',
    'VIEWER', 'AREA_VIEWER', 'DEPARTMENT_MANAGER', 'DEPARTMENT_LEAD',
    'SUBCONTRACTS_COORDINATOR'
  ));
CREATE UNIQUE INDEX IF NOT EXISTS project_acting_survey_manager_uq
  ON project_memberships (project_id) WHERE designated_acting_for = 'SURVEY_MANAGER';

CREATE TABLE IF NOT EXISTS aor_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, depth),
  UNIQUE (id, project_id, tenant_id),
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id)
);

CREATE TABLE IF NOT EXISTS aor_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  level_id UUID NOT NULL,
  parent_id UUID,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (parent_id IS NULL OR parent_id <> id),
  UNIQUE (project_id, code),
  UNIQUE (id, project_id, tenant_id),
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id),
  FOREIGN KEY (level_id, project_id, tenant_id)
    REFERENCES aor_levels(id, project_id, tenant_id),
  FOREIGN KEY (parent_id, project_id, tenant_id)
    REFERENCES aor_nodes(id, project_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS aor_nodes_parent_idx ON aor_nodes(parent_id);
CREATE INDEX IF NOT EXISTS aor_nodes_roots_idx ON aor_nodes(project_id) WHERE parent_id IS NULL;

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  manager_title TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name),
  UNIQUE (id, project_id, tenant_id),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id),
  FOREIGN KEY (created_by, tenant_id) REFERENCES users(id, tenant_id)
);

CREATE TABLE IF NOT EXISTS department_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  department_id UUID NOT NULL,
  title TEXT NOT NULL,
  default_priority TEXT NOT NULL CHECK (default_priority IN ('HIGH','MED_HIGH','MEDIUM','NORMAL')),
  assignment_layer TEXT NOT NULL CHECK (assignment_layer IN ('MANAGER','SUPERINTENDENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, title),
  FOREIGN KEY (department_id, tenant_id) REFERENCES departments(id, tenant_id)
);

CREATE TABLE IF NOT EXISTS department_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  department_id UUID NOT NULL,
  title TEXT,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ,
  superintendent_id UUID,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id),
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id),
  FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id),
  FOREIGN KEY (department_id, project_id, tenant_id)
    REFERENCES departments(id, project_id, tenant_id),
  FOREIGN KEY (assigned_by, tenant_id) REFERENCES users(id, tenant_id),
  FOREIGN KEY (superintendent_id, tenant_id) REFERENCES users(id, tenant_id)
);

CREATE TABLE IF NOT EXISTS aor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  aor_node_id UUID NOT NULL,
  user_id UUID,
  department_id UUID,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((user_id IS NOT NULL) <> (department_id IS NOT NULL)),
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id),
  FOREIGN KEY (aor_node_id, project_id, tenant_id)
    REFERENCES aor_nodes(id, project_id, tenant_id),
  FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id),
  FOREIGN KEY (department_id, project_id, tenant_id)
    REFERENCES departments(id, project_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS aor_assignments_user_idx
  ON aor_assignments(project_id, user_id) WHERE deactivated_at IS NULL;

CREATE TABLE IF NOT EXISTS project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  crew_build TEXT NOT NULL CHECK (crew_build IN ('FULL','MEDIUM','SLIM')),
  aor_depth INTEGER NOT NULL CHECK (aor_depth > 0),
  aor_level_labels JSONB NOT NULL,
  discipline_groups JSONB NOT NULL DEFAULT '[]',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (created_by, tenant_id) REFERENCES users(id, tenant_id)
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS template_id UUID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_template_tenant_fk') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_template_tenant_fk
      FOREIGN KEY (template_id, tenant_id) REFERENCES project_templates(id, tenant_id) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS acting_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  scope JSONB NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('VACANCY','CASCADE')),
  cascade_level INTEGER,
  granted_by TEXT NOT NULL,
  granted_reason TEXT NOT NULL,
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id),
  FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES users(id);
ALTER TABLE crew_rosters ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS canceled_by UUID REFERENCES users(id);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS aor_node_id UUID;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS department_id UUID;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS survey_superintendent_id UUID;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS survey_manager_id UUID;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pending_field_status TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pending_field_reason TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pending_field_initiated_by UUID;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS delayed_reason TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cancel_initiated_by UUID;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cancel_initiated_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cancel_initiator_role TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS cancel_approved_by UUID;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE tickets ALTER COLUMN area_id DROP NOT NULL;
ALTER TABLE tickets ALTER COLUMN subarea_id DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_aor_node_scope_fk') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_aor_node_scope_fk
      FOREIGN KEY (aor_node_id, project_id, tenant_id)
      REFERENCES aor_nodes(id, project_id, tenant_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_department_scope_fk') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_department_scope_fk
      FOREIGN KEY (department_id, project_id, tenant_id)
      REFERENCES departments(id, project_id, tenant_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_location_source_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_location_source_check CHECK (
  (aor_node_id IS NOT NULL AND area_id IS NULL AND subarea_id IS NULL)
  OR (aor_node_id IS NULL AND area_id IS NOT NULL AND subarea_id IS NOT NULL)
) NOT VALID;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_pending_field_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_pending_field_status_check
  CHECK (pending_field_status IS NULL OR pending_field_status IN ('COMPLETED','DELAYED','FIELD_CANCELED'));
