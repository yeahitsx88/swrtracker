-- Amelia beta foundation. Additive only: existing ticket states and history retain
-- their original meanings. The new workflow is enabled by later application work.

ALTER TABLE projects
  ADD CONSTRAINT projects_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE users
  ADD CONSTRAINT users_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE users
  ADD CONSTRAINT users_tenant_id_id_company_id_key UNIQUE (tenant_id, id, company_id);

ALTER TABLE tickets
  ADD CONSTRAINT tickets_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE aor_nodes
  ADD CONSTRAINT aor_nodes_tenant_project_id_key UNIQUE (tenant_id, project_id, id);

-- Historical invites remain readable; unbound pending invites are refused by
-- the registration handler. All newly issued invites must set company_id.
ALTER TABLE invites
  ADD COLUMN company_id UUID;

ALTER TABLE invites
  ADD CONSTRAINT invites_tenant_company_fkey
  FOREIGN KEY (tenant_id, company_id) REFERENCES companies (tenant_id, id);

CREATE INDEX idx_invites_tenant_project_company
  ON invites (tenant_id, project_id, company_id)
  WHERE accepted_at IS NULL AND canceled_at IS NULL;

CREATE TABLE project_responsibility_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  aor_node_id UUID,
  user_id UUID NOT NULL,
  responsibility TEXT NOT NULL CHECK (responsibility IN ('SURVEY_REVIEWER', 'FIELD_COORDINATOR')),
  granted_by UUID NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by UUID,
  revoked_at TIMESTAMPTZ,
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id),
  FOREIGN KEY (tenant_id, project_id, aor_node_id) REFERENCES aor_nodes(tenant_id, project_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, granted_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, revoked_by) REFERENCES users(tenant_id, id)
);

CREATE UNIQUE INDEX idx_project_responsibility_active
  ON project_responsibility_grants (tenant_id, project_id, user_id, responsibility, aor_node_id) NULLS NOT DISTINCT
  WHERE revoked_at IS NULL;

CREATE TABLE company_authority_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  granted_by UUID NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by UUID,
  revoked_at TIMESTAMPTZ,
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id),
  FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, id),
  FOREIGN KEY (tenant_id, user_id, company_id) REFERENCES users(tenant_id, id, company_id),
  FOREIGN KEY (tenant_id, granted_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, revoked_by) REFERENCES users(tenant_id, id)
);

CREATE UNIQUE INDEX idx_company_authority_active
  ON company_authority_grants (tenant_id, project_id, company_id, user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE access_grant_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  company_id UUID,
  subject_user_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('COMPANY_AUTHORITY_GRANTED', 'COMPANY_AUTHORITY_REVOKED', 'RESPONSIBILITY_GRANTED', 'RESPONSIBILITY_REVOKED')),
  grant_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id),
  FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, id),
  FOREIGN KEY (tenant_id, subject_user_id) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES users(tenant_id, id)
);

ALTER TABLE tickets
  ADD COLUMN return_cycle INTEGER NOT NULL DEFAULT 0 CHECK (return_cycle >= 0),
  ADD COLUMN first_submitted_at TIMESTAMPTZ,
  ADD COLUMN original_requested_date DATE;

UPDATE tickets
SET first_submitted_at = submitted_at,
    original_requested_date = requested_date
WHERE first_submitted_at IS NULL OR original_requested_date IS NULL;

CREATE TABLE ticket_return_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ticket_id UUID NOT NULL,
  cycle_number INTEGER NOT NULL CHECK (cycle_number > 0),
  origin TEXT NOT NULL CHECK (origin IN ('INITIAL_REVIEW', 'SURVEY_CHANGE', 'FIELD_INABILITY')),
  reason TEXT NOT NULL CHECK (LENGTH(TRIM(reason)) > 0),
  returned_by UUID NOT NULL,
  returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resubmitted_at TIMESTAMPTZ,
  UNIQUE (ticket_id, cycle_number),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets(tenant_id, id),
  FOREIGN KEY (tenant_id, returned_by) REFERENCES users(tenant_id, id)
);

CREATE TABLE ticket_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ticket_id UUID NOT NULL,
  party_chief_id UUID,
  instrument_man_id UUID,
  assigned_by UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  CHECK (party_chief_id IS NOT NULL OR instrument_man_id IS NOT NULL),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets(tenant_id, id),
  FOREIGN KEY (tenant_id, party_chief_id) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, instrument_man_id) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, assigned_by) REFERENCES users(tenant_id, id)
);

CREATE TABLE ticket_need_by_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ticket_id UUID NOT NULL,
  old_date DATE NOT NULL,
  new_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (LENGTH(TRIM(reason)) > 0),
  revised_by UUID NOT NULL,
  revised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (old_date <> new_date),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets(tenant_id, id),
  FOREIGN KEY (tenant_id, revised_by) REFERENCES users(tenant_id, id)
);

CREATE TABLE notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ticket_id UUID NOT NULL,
  recipient_user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery_state TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (delivery_state IN ('QUEUED', 'CAPTURED', 'SENT', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL,
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets(tenant_id, id),
  FOREIGN KEY (tenant_id, recipient_user_id) REFERENCES users(tenant_id, id)
);

ALTER TABLE attachments
  ADD COLUMN purpose TEXT NOT NULL DEFAULT 'REQUEST_INSTRUCTION'
    CHECK (purpose IN ('REQUEST_INSTRUCTION', 'FIELD_SUPPORT')),
  ADD COLUMN return_cycle INTEGER NOT NULL DEFAULT 0 CHECK (return_cycle >= 0),
  ADD COLUMN content_sha256 TEXT;

ALTER TABLE projects
  ADD COLUMN max_attachments_per_ticket INTEGER
    CHECK (max_attachments_per_ticket IS NULL OR max_attachments_per_ticket BETWEEN 1 AND 100);
