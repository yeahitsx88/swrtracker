-- Durable notification fan-out and email delivery state. Audit events remain append-only.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_events_id_tenant_uq
  ON ticket_events (id, tenant_id);

CREATE TABLE IF NOT EXISTS notification_event_receipts (
  event_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_event_receipts_event_fk
    FOREIGN KEY (event_id, tenant_id) REFERENCES ticket_events (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  recipient_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'SKIPPED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, recipient_user_id),
  CONSTRAINT notification_deliveries_event_fk
    FOREIGN KEY (event_id, tenant_id) REFERENCES ticket_events (id, tenant_id),
  CONSTRAINT notification_deliveries_user_fk
    FOREIGN KEY (recipient_user_id, tenant_id) REFERENCES users (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS notification_deliveries_ready_idx
  ON notification_deliveries (next_attempt_at, created_at)
  WHERE status IN ('PENDING', 'SENDING');

CREATE INDEX IF NOT EXISTS ticket_events_notification_scan_idx
  ON ticket_events (created_at, id)
  WHERE event_type IN (
    'ticket.assigned', 'ticket.requester_canceled', 'ticket.field_cancel_requested',
    'ticket.field_canceled', 'ticket.survey_cancel_requested',
    'ticket.survey_canceled', 'ticket.assignment_orphaned',
    'ticket.pending_pc_approval', 'ticket.pc_approval_rejected',
    'ticket.pc_approval_overridden', 'ticket.approved', 'ticket.rejected',
    'ticket.rejection_overridden',
    'ticket.completed', 'ticket.delayed'
  );
