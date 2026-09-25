-- Durable daily continuity escalation deliveries. The source UUID identifies
-- either an acting grant or a tenant vacancy event; the worker verifies the
-- source is still unresolved before claiming each delivery.
CREATE TABLE IF NOT EXISTS continuity_alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  alert_kind TEXT NOT NULL CHECK (alert_kind IN (
    'ACTING_CONFIRMATION_OVERDUE', 'CREW_VACANCY_OVERDUE'
  )),
  source_id UUID NOT NULL,
  reminder_day INTEGER NOT NULL CHECK (reminder_day > 0),
  recipient_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'SKIPPED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, project_id, alert_kind, source_id, reminder_day,
          recipient_user_id),
  CONSTRAINT continuity_alert_project_tenant_fk
    FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id),
  CONSTRAINT continuity_alert_recipient_tenant_fk
    FOREIGN KEY (recipient_user_id, tenant_id) REFERENCES users(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS continuity_alert_deliveries_ready_idx
  ON continuity_alert_deliveries(next_attempt_at, created_at, id)
  WHERE status IN ('PENDING', 'SENDING');

CREATE INDEX IF NOT EXISTS ticket_events_im_reassigned_notification_idx
  ON ticket_events(created_at, id)
  WHERE event_type = 'ticket.im_reassigned';
