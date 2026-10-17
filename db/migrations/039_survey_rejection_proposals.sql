CREATE TABLE survey_rejection_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  ticket_id UUID NOT NULL,
  proposed_by UUID NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  ticket_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  outcome TEXT CHECK (outcome IN ('CONFIRMED','DECLINED','SUPERSEDED')),
  CHECK ((resolved_at IS NULL AND resolved_by IS NULL AND outcome IS NULL) OR
         (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND outcome IS NOT NULL)),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets(tenant_id,id),
  FOREIGN KEY (tenant_id, proposed_by) REFERENCES users(tenant_id,id),
  FOREIGN KEY (tenant_id, resolved_by) REFERENCES users(tenant_id,id)
);
CREATE UNIQUE INDEX survey_rejection_pending ON survey_rejection_proposals(tenant_id,ticket_id)
  WHERE resolved_at IS NULL;
