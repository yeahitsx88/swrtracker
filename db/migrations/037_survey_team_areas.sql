-- Preserve the original Area and all team/member identities while allowing
-- several teams to cover an Area and each team to cover several Areas.
CREATE TABLE survey_team_areas (
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  team_id UUID NOT NULL,
  area_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, project_id, team_id, area_id),
  FOREIGN KEY (tenant_id, project_id, team_id) REFERENCES survey_teams(tenant_id, project_id, id),
  FOREIGN KEY (tenant_id, project_id, area_id) REFERENCES aor_nodes(tenant_id, project_id, id)
);
INSERT INTO survey_team_areas (tenant_id, project_id, team_id, area_id, deactivated_at)
SELECT tenant_id, project_id, id, aor_node_id, deactivated_at FROM survey_teams;
CREATE INDEX survey_team_area_coverage ON survey_team_areas(tenant_id, project_id, area_id, team_id)
WHERE deactivated_at IS NULL;
