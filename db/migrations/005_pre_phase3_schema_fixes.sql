-- Migration 005: Pre-Phase 3 schema alignment
-- Resolves all gaps identified in the Phase 2 → Phase 3 audit.
-- Applies atomically — run inside a single transaction.

-- ---------------------------------------------------------------------------
-- users: password_hash nullable (SSO future-proofing) + auth_method column
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'LOCAL'
  CHECK (auth_method IN ('LOCAL', 'SSO'));

-- ---------------------------------------------------------------------------
-- tickets: ticket_type column
-- ---------------------------------------------------------------------------
ALTER TABLE tickets
  ADD COLUMN ticket_type TEXT NOT NULL DEFAULT 'LAYOUT'
  CHECK (ticket_type IN ('LAYOUT', 'CHECK_OUT', 'AS_BUILT', 'TOPO', 'PERMIT'));

-- Remove the default after adding — new inserts must supply the value explicitly.
ALTER TABLE tickets
  ALTER COLUMN ticket_type DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- tickets: rename assigned_crew_id → assigned_party_chief_id
--          add assigned_instrument_man_id
-- ---------------------------------------------------------------------------
ALTER TABLE tickets
  RENAME COLUMN assigned_crew_id TO assigned_party_chief_id;

ALTER TABLE tickets
  ADD COLUMN assigned_instrument_man_id UUID REFERENCES users(id);

-- Fix the index that was keyed on the old column name
DROP INDEX IF EXISTS idx_tickets_tenant_project_crew;

CREATE INDEX idx_tickets_tenant_project_party_chief
  ON tickets (tenant_id, project_id, assigned_party_chief_id);

-- ---------------------------------------------------------------------------
-- allowed_domains
-- TENANT_ADMIN only may insert/delete rows.
-- ---------------------------------------------------------------------------
CREATE TABLE allowed_domains (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  domain      TEXT        NOT NULL,  -- e.g. "zachrygroup.com"
  added_by    UUID        NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, domain)
);

CREATE INDEX idx_allowed_domains_tenant ON allowed_domains (tenant_id);

-- ---------------------------------------------------------------------------
-- invites
-- Single-use, expiry-enforced tokens for onboarding users without a matching domain.
-- ---------------------------------------------------------------------------
CREATE TABLE invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  project_id  UUID        NOT NULL REFERENCES projects(id),
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL,
  token       UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by  UUID        NOT NULL REFERENCES users(id),
  accepted_at TIMESTAMPTZ,           -- stamped on acceptance; null = pending
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invites_pending
  ON invites (tenant_id, project_id)
  WHERE accepted_at IS NULL;

-- ---------------------------------------------------------------------------
-- crew_rosters
-- Survey Lead manages roster entries. Changeable, audit-logged.
-- ---------------------------------------------------------------------------
CREATE TABLE crew_rosters (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID        NOT NULL REFERENCES projects(id),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id),
  party_chief_id     UUID        NOT NULL REFERENCES users(id),
  instrument_man_id  UUID        NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, instrument_man_id)  -- one IM per PC per project
);

CREATE INDEX idx_crew_rosters_tenant_project
  ON crew_rosters (tenant_id, project_id);

CREATE INDEX idx_crew_rosters_project_party_chief
  ON crew_rosters (project_id, party_chief_id);

-- ---------------------------------------------------------------------------
-- area_memberships
-- Used exclusively for AREA_VIEWER role scoping.
-- ---------------------------------------------------------------------------
CREATE TABLE area_memberships (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id),
  user_id     UUID        NOT NULL REFERENCES users(id),
  area_id     UUID        NOT NULL REFERENCES areas(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id, area_id)
);

CREATE INDEX idx_area_memberships_project_user
  ON area_memberships (project_id, user_id);

-- ---------------------------------------------------------------------------
-- help_flags
-- Two-level overload signal system (CLAUDE.md §10).
-- ---------------------------------------------------------------------------
CREATE TABLE help_flags (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  project_id      UUID        NOT NULL REFERENCES projects(id),
  raised_by       UUID        NOT NULL REFERENCES users(id),
  level           INTEGER     NOT NULL CHECK (level IN (1, 2)),
  reason          TEXT,
  status          TEXT        NOT NULL DEFAULT 'ACTIVE'
                              CHECK (status IN ('ACTIVE', 'CLEARED')),
  escalated_from  UUID        REFERENCES help_flags(id),  -- set when L1 escalated to L2
  cleared_at      TIMESTAMPTZ,
  cleared_reason  TEXT        CHECK (
                    cleared_reason IS NULL OR
                    cleared_reason IN ('TICKETS_REASSIGNED', 'MANUALLY_CLEARED')
                  ),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_help_flags_tenant_project_status
  ON help_flags (tenant_id, project_id, status);

-- ---------------------------------------------------------------------------
-- project_memberships: add AREA_VIEWER to role constraint
-- ---------------------------------------------------------------------------
ALTER TABLE project_memberships
  DROP CONSTRAINT IF EXISTS project_memberships_role_check;

ALTER TABLE project_memberships
  ADD CONSTRAINT project_memberships_role_check
  CHECK (role IN (
    'REQUESTER',
    'APPROVER',
    'SURVEY_LEAD',
    'PARTY_CHIEF',
    'INSTRUMENT_MAN',
    'CAD_TECHNICIAN',
    'CAD_LEAD',
    'VIEWER',
    'AREA_VIEWER'
  ));
