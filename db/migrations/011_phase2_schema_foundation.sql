-- Migration 011: Phase 2 schema foundation
-- Adds the Phase 2 data model while preserving legacy tables for compatibility.

-- ---------------------------------------------------------------------------
-- projects: lifecycle/build/template fields
-- ---------------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS crew_build TEXT NOT NULL DEFAULT 'FULL'
  CHECK (crew_build IN ('FULL', 'MEDIUM', 'SLIM'));

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS template_id UUID;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS activated_by UUID REFERENCES users(id);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id);

UPDATE projects
SET status = 'ACTIVE'
WHERE status NOT IN ('SETUP', 'ACTIVE', 'ARCHIVED');

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('SETUP', 'ACTIVE', 'ARCHIVED'));

-- ---------------------------------------------------------------------------
-- users: title and deactivation lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES users(id);

-- ---------------------------------------------------------------------------
-- crew_rosters: deactivation lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE crew_rosters
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- project_memberships: acting designation and expanded role enum
-- ---------------------------------------------------------------------------
ALTER TABLE project_memberships
  ADD COLUMN IF NOT EXISTS designated_acting_for TEXT;

UPDATE project_memberships
SET role = 'DEPARTMENT_MANAGER'
WHERE role = 'DISCIPLINE_MANAGER';

UPDATE project_memberships
SET role = 'DEPARTMENT_LEAD'
WHERE role = 'DISCIPLINE_LEAD';

ALTER TABLE project_memberships
  DROP CONSTRAINT IF EXISTS project_memberships_role_check;

ALTER TABLE project_memberships
  ADD CONSTRAINT project_memberships_role_check
  CHECK (role IN (
    'REQUESTER',
    'PROJECT_ADMIN',
    'SURVEY_MANAGER',
    'SURVEY_SUPERINTENDENT',
    'PARTY_CHIEF',
    'INSTRUMENT_MAN',
    'CAD_TECHNICIAN',
    'CAD_LEAD',
    'DEPARTMENT_MANAGER',
    'DEPARTMENT_LEAD',
    'VIEWER',
    'AREA_VIEWER',
    'SUBCONTRACTS_COORDINATOR'
  ));

ALTER TABLE project_memberships
  DROP CONSTRAINT IF EXISTS project_memberships_designated_acting_for_check;

ALTER TABLE project_memberships
  ADD CONSTRAINT project_memberships_designated_acting_for_check
  CHECK (
    designated_acting_for IS NULL OR
    designated_acting_for IN (
      'SURVEY_MANAGER',
      'SURVEY_SUPERINTENDENT',
      'PARTY_CHIEF',
      'INSTRUMENT_MAN'
    )
  );

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  name          TEXT        NOT NULL,
  manager_title TEXT        NOT NULL,
  created_by    UUID        NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS department_memberships (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID        NOT NULL REFERENCES projects(id),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id),
  user_id            UUID        NOT NULL REFERENCES users(id),
  department_id      UUID        NOT NULL REFERENCES departments(id),
  title              TEXT,
  assigned_by        UUID        REFERENCES users(id),
  assigned_at        TIMESTAMPTZ,
  superintendent_id  UUID        REFERENCES users(id),
  deactivated_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS department_titles (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  department_id    UUID        NOT NULL REFERENCES departments(id),
  title            TEXT        NOT NULL,
  default_priority TEXT        NOT NULL CHECK (default_priority IN ('HIGH', 'MED_HIGH', 'MEDIUM', 'NORMAL')),
  assignment_layer TEXT        NOT NULL CHECK (assignment_layer IN ('MANAGER', 'SUPERINTENDENT')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, title)
);

CREATE INDEX IF NOT EXISTS idx_department_memberships_project_user
  ON department_memberships (project_id, user_id);

CREATE INDEX IF NOT EXISTS idx_department_titles_project_department
  ON department_titles (department_id);

-- ---------------------------------------------------------------------------
-- AOR hierarchy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aor_levels (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  depth      INTEGER     NOT NULL CHECK (depth >= 0),
  label      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, depth),
  UNIQUE (project_id, label)
);

CREATE TABLE IF NOT EXISTS aor_nodes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  level_id   UUID        NOT NULL REFERENCES aor_levels(id),
  parent_id  UUID        REFERENCES aor_nodes(id),
  name       TEXT        NOT NULL,
  code       TEXT        NOT NULL,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS aor_assignments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES projects(id),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id),
  user_id        UUID        REFERENCES users(id),
  aor_node_id    UUID        NOT NULL REFERENCES aor_nodes(id),
  department_id  UUID        REFERENCES departments(id),
  deactivated_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (user_id IS NOT NULL AND department_id IS NULL) OR
    (user_id IS NULL AND department_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_aor_assignments_project_user
  ON aor_assignments (project_id, user_id);

CREATE INDEX IF NOT EXISTS idx_aor_assignments_project_node
  ON aor_assignments (project_id, aor_node_id);

CREATE INDEX IF NOT EXISTS idx_aor_nodes_parent
  ON aor_nodes (parent_id);

-- Seed a two-level AOR tree from legacy areas/subareas if it has not been created yet.
INSERT INTO aor_levels (project_id, tenant_id, depth, label)
SELECT p.id, p.tenant_id, 0, 'AREA'
FROM projects p
WHERE NOT EXISTS (
  SELECT 1
  FROM aor_levels l
  WHERE l.project_id = p.id AND l.depth = 0
);

INSERT INTO aor_levels (project_id, tenant_id, depth, label)
SELECT p.id, p.tenant_id, 1, 'SUBAREA'
FROM projects p
WHERE EXISTS (
  SELECT 1
  FROM subareas s
  WHERE s.project_id = p.id
)
AND NOT EXISTS (
  SELECT 1
  FROM aor_levels l
  WHERE l.project_id = p.id AND l.depth = 1
);

INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, parent_id, name, code, created_at)
SELECT
  a.id,
  a.project_id,
  a.tenant_id,
  l.id,
  NULL,
  a.name,
  a.code,
  a.created_at
FROM areas a
JOIN aor_levels l
  ON l.project_id = a.project_id
 AND l.depth = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM aor_nodes n
  WHERE n.id = a.id
);

INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, parent_id, name, code, created_at)
SELECT
  s.id,
  s.project_id,
  s.tenant_id,
  l.id,
  s.area_id,
  s.name,
  COALESCE(a.code || '-' || ROW_NUMBER() OVER (PARTITION BY s.area_id ORDER BY s.created_at, s.id), s.id::text),
  s.created_at
FROM subareas s
JOIN areas a
  ON a.id = s.area_id
JOIN aor_levels l
  ON l.project_id = s.project_id
 AND l.depth = 1
WHERE NOT EXISTS (
  SELECT 1
  FROM aor_nodes n
  WHERE n.id = s.id
);

INSERT INTO aor_assignments (project_id, tenant_id, user_id, aor_node_id, created_at)
SELECT
  am.project_id,
  p.tenant_id,
  am.user_id,
  am.area_id,
  am.created_at
FROM area_memberships am
JOIN projects p
  ON p.id = am.project_id
WHERE NOT EXISTS (
  SELECT 1
  FROM aor_assignments aa
  WHERE aa.project_id = am.project_id
    AND aa.user_id = am.user_id
    AND aa.aor_node_id = am.area_id
);

-- ---------------------------------------------------------------------------
-- acting grants and templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acting_grants (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id),
  project_id     UUID        NOT NULL REFERENCES projects(id),
  user_id        UUID        NOT NULL REFERENCES users(id),
  role           TEXT        NOT NULL,
  scope          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  trigger        TEXT        NOT NULL CHECK (trigger IN ('VACANCY', 'CASCADE')),
  cascade_level  INTEGER,
  granted_by     TEXT        NOT NULL,
  granted_reason TEXT        NOT NULL,
  confirmed_by   UUID        REFERENCES users(id),
  confirmed_at   TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  revoked_by     UUID        REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_templates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),
  name              TEXT        NOT NULL,
  crew_build        TEXT        NOT NULL CHECK (crew_build IN ('FULL', 'MEDIUM', 'SLIM')),
  aor_depth         INTEGER     NOT NULL CHECK (aor_depth >= 0),
  aor_level_labels  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  discipline_groups JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_template_id_fkey;

ALTER TABLE projects
  ADD CONSTRAINT projects_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES project_templates(id);

-- ---------------------------------------------------------------------------
-- invites/help flags/aor retirement additions
-- ---------------------------------------------------------------------------
ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

ALTER TABLE help_flags
  ADD COLUMN IF NOT EXISTS affected_ticket_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- tickets: Phase 2 AOR + priority + lifecycle columns
-- ---------------------------------------------------------------------------
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS aor_node_id UUID REFERENCES aor_nodes(id);

UPDATE tickets
SET aor_node_id = subarea_id
WHERE aor_node_id IS NULL
  AND subarea_id IS NOT NULL;

ALTER TABLE tickets
  ALTER COLUMN aor_node_id SET NOT NULL;

ALTER TABLE tickets
  ALTER COLUMN area_id DROP NOT NULL;

ALTER TABLE tickets
  ALTER COLUMN subarea_id DROP NOT NULL;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS priority TEXT;

UPDATE tickets
SET priority = CASE
  WHEN is_priority THEN 'HIGH'
  ELSE 'NORMAL'
END
WHERE priority IS NULL;

ALTER TABLE tickets
  ALTER COLUMN priority SET NOT NULL;

ALTER TABLE tickets
  ALTER COLUMN priority SET DEFAULT 'NORMAL';

ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_priority_check;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_priority_check
  CHECK (priority IN ('HIGH', 'MED_HIGH', 'MEDIUM', 'NORMAL'));

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS priority_set_by UUID REFERENCES users(id);

UPDATE tickets
SET priority_set_by = priority_elevated_by
WHERE priority_set_by IS NULL
  AND priority_elevated_by IS NOT NULL;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS priority_set_reason TEXT;

UPDATE tickets
SET priority_set_reason = priority_elevated_reason
WHERE priority_set_reason IS NULL
  AND priority_elevated_reason IS NOT NULL;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS cancel_initiated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tickets_tenant_project_aor
  ON tickets (tenant_id, project_id, aor_node_id);

CREATE INDEX IF NOT EXISTS idx_tickets_tenant_project_priority
  ON tickets (tenant_id, project_id, priority);
