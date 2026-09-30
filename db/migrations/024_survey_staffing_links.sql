-- Explicit project reporting links. Area overlap alone never establishes a
-- Superintendent -> Party Chief relationship.
ALTER TABLE aor_nodes
  ADD CONSTRAINT aor_nodes_tenant_project_id_key UNIQUE (tenant_id, project_id, id);

CREATE TABLE survey_reporting_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  superintendent_id UUID NOT NULL,
  party_chief_id UUID NOT NULL,
  aor_node_id UUID NOT NULL,
  assigned_by UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id),
  FOREIGN KEY (tenant_id, superintendent_id) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, party_chief_id) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, assigned_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, project_id, aor_node_id) REFERENCES aor_nodes(tenant_id, project_id, id)
);

CREATE UNIQUE INDEX survey_reporting_links_active_chief
  ON survey_reporting_links (project_id, party_chief_id)
  WHERE deactivated_at IS NULL;

CREATE INDEX survey_reporting_links_active_superintendent
  ON survey_reporting_links (tenant_id, project_id, superintendent_id, aor_node_id)
  WHERE deactivated_at IS NULL;

-- Project staffing changes are not ticket transitions. Keep their history in
-- an append-only project-level log rather than inventing a ticket event.
CREATE TABLE survey_staffing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type = 'survey.staffing_saved'),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES users(tenant_id, id)
);

CREATE INDEX survey_staffing_events_project_time
  ON survey_staffing_events (tenant_id, project_id, created_at DESC);
