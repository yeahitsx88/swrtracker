-- Migration 001: Initial schema
-- All tables defined in CLAUDE.md Section 5

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  name        TEXT        NOT NULL,
  status      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
CREATE TABLE companies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('GC', 'SUBCONTRACTOR', 'OWNER_REP')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id),
  company_id    UUID        NOT NULL REFERENCES companies(id),
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

-- ---------------------------------------------------------------------------
-- project_memberships
-- ---------------------------------------------------------------------------
CREATE TABLE project_memberships (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id),
  user_id     UUID        NOT NULL REFERENCES users(id),
  role        TEXT        NOT NULL CHECK (role IN (
                'TENANT_ADMIN',
                'BILLING_VIEWER',
                'REQUESTER',
                'APPROVER',
                'SURVEY_LEAD',
                'PARTY_CHIEF',
                'INSTRUMENT_MAN',
                'VIEWER'
              )),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- ---------------------------------------------------------------------------
-- priority_whitelist
-- TENANT_ADMIN only may insert/delete rows.
-- Checked at ticket submission against requester email.
-- ---------------------------------------------------------------------------
CREATE TABLE priority_whitelist (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  project_id  UUID        NOT NULL REFERENCES projects(id),
  email       TEXT        NOT NULL,
  added_by    UUID        NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, project_id, email)
);

-- ---------------------------------------------------------------------------
-- areas  (Unit/System level)
-- ---------------------------------------------------------------------------
CREATE TABLE areas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  name        TEXT        NOT NULL,
  code        TEXT        NOT NULL,   -- short slug e.g. "U1", "CT", "PR"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, code)
);

-- ---------------------------------------------------------------------------
-- subareas
-- ---------------------------------------------------------------------------
CREATE TABLE subareas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id     UUID        NOT NULL REFERENCES areas(id),
  project_id  UUID        NOT NULL REFERENCES projects(id),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- tickets
-- ticket_number: FSS-[AREA_CODE]-[ZERO_PADDED_SEQUENCE], immutable after creation
-- ---------------------------------------------------------------------------
CREATE TABLE tickets (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL REFERENCES tenants(id),
  project_id               UUID        NOT NULL REFERENCES projects(id),
  area_id                  UUID        NOT NULL REFERENCES areas(id),
  subarea_id               UUID        NOT NULL REFERENCES subareas(id),
  company_id               UUID        NOT NULL REFERENCES companies(id),
  ticket_number            TEXT        NOT NULL,
  requester_id             UUID        NOT NULL REFERENCES users(id),
  assigned_crew_id         UUID        REFERENCES users(id),
  survey_lead_id           UUID        REFERENCES users(id),
  workflow_variant         TEXT        NOT NULL CHECK (workflow_variant IN (
                             'STANDARD_APPROVAL',
                             'DIRECT_ASSIGNMENT'
                           )),
  status                   TEXT        NOT NULL,
  craft                    TEXT        NOT NULL,
  description              TEXT        NOT NULL,
  requested_date           DATE        NOT NULL,
  submitted_at             TIMESTAMPTZ,
  approved_at              TIMESTAMPTZ,
  assigned_at              TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  rejection_reason         TEXT,                      -- required when status = REJECTED
  parent_ticket_id         UUID        REFERENCES tickets(id),
  is_priority              BOOLEAN     NOT NULL DEFAULT FALSE,
  priority_elevated_by     UUID        REFERENCES users(id),
  priority_elevated_reason TEXT,                      -- required when priority_elevated_by is set
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, ticket_number)
);

-- ---------------------------------------------------------------------------
-- ticket_events  (append-only — no updates, no deletes, ever)
-- ---------------------------------------------------------------------------
CREATE TABLE ticket_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID        NOT NULL REFERENCES tickets(id),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  actor_id    UUID        NOT NULL REFERENCES users(id),
  event_type  TEXT        NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- attachments
-- Actual file bytes are stored in object storage; this table holds metadata only.
-- ---------------------------------------------------------------------------
CREATE TABLE attachments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID        NOT NULL REFERENCES tickets(id),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id),
  uploaded_by  UUID        NOT NULL REFERENCES users(id),
  filename     TEXT        NOT NULL,
  mime_type    TEXT        NOT NULL,
  storage_key  TEXT        NOT NULL,
  size_bytes   INTEGER     NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes  (Section 5)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_tickets_tenant_project_status   ON tickets (tenant_id, project_id, status);
CREATE INDEX idx_tickets_tenant_project_crew      ON tickets (tenant_id, project_id, assigned_crew_id);
CREATE INDEX idx_tickets_tenant_project_created   ON tickets (tenant_id, project_id, created_at);
CREATE INDEX idx_tickets_tenant_company           ON tickets (tenant_id, company_id);
