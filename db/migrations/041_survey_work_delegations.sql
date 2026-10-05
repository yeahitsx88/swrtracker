CREATE TABLE survey_work_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  ticket_id UUID NOT NULL,
  team_id UUID NOT NULL,
  lead_user_id UUID NOT NULL,
  delegated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  CHECK ((ended_at IS NULL)=(end_reason IS NULL)),
  FOREIGN KEY (tenant_id,project_id,team_id) REFERENCES survey_teams(tenant_id,project_id,id),
  FOREIGN KEY (tenant_id,ticket_id) REFERENCES tickets(tenant_id,id),
  FOREIGN KEY (tenant_id,lead_user_id) REFERENCES users(tenant_id,id),
  FOREIGN KEY (tenant_id,delegated_by) REFERENCES users(tenant_id,id)
);
CREATE UNIQUE INDEX survey_work_one_delegation ON survey_work_delegations(tenant_id,ticket_id) WHERE ended_at IS NULL;
