-- Named organizational teams are separate from authorization and crew reporting.
CREATE TABLE survey_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  aor_node_id UUID NOT NULL,
  lead_user_id UUID NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, project_id, id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id),
  FOREIGN KEY (tenant_id, project_id, aor_node_id) REFERENCES aor_nodes(tenant_id, project_id, id),
  FOREIGN KEY (tenant_id, lead_user_id) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)
);

CREATE UNIQUE INDEX survey_teams_active_name
  ON survey_teams (tenant_id, project_id, lower(btrim(name))) WHERE deactivated_at IS NULL;

CREATE TABLE survey_team_members (
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  team_id UUID NOT NULL,
  user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, project_id, team_id, user_id),
  FOREIGN KEY (tenant_id, project_id, team_id) REFERENCES survey_teams(tenant_id, project_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id),
  FOREIGN KEY (project_id, user_id) REFERENCES project_memberships(project_id, user_id)
);

CREATE UNIQUE INDEX survey_team_members_one_active_team
  ON survey_team_members (tenant_id, project_id, user_id) WHERE deactivated_at IS NULL;

-- Deferral allows the team and its first members to be inserted atomically.
-- Soft removal retains the historical member row; active lead membership is
-- additionally enforced by the use case before each mutation.
ALTER TABLE survey_teams ADD CONSTRAINT survey_teams_lead_member_fkey
  FOREIGN KEY (tenant_id, project_id, id, lead_user_id)
  REFERENCES survey_team_members(tenant_id, project_id, team_id, user_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE survey_staffing_events DROP CONSTRAINT survey_staffing_events_event_type_check;
ALTER TABLE survey_staffing_events ADD CONSTRAINT survey_staffing_events_event_type_check
  CHECK (event_type IN ('survey.staffing_saved', 'survey.team_created', 'survey.team_updated',
    'survey.team_deactivated', 'survey.role_changed'));
