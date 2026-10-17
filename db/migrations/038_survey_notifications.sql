CREATE TABLE survey_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  event_key TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, recipient_id, event_key),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id),
  FOREIGN KEY (tenant_id, recipient_id) REFERENCES users(tenant_id,id),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX survey_notifications_inbox ON survey_notifications(tenant_id,project_id,recipient_id,created_at DESC,id);
