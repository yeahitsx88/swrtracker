-- Per-person, per-project "seen through" watermark for the in-app notification
-- inbox. Notices themselves stay in notification_outbox / survey_notifications;
-- this only records how far the person has looked, to show an unread count.
CREATE TABLE notification_reads (
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  seen_through TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, project_id, user_id),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id)
);

-- Inbox reads by recipient within a project.
CREATE INDEX notification_outbox_recipient_time ON notification_outbox(tenant_id, recipient_user_id, created_at DESC);
