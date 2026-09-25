-- Durable invitation email outbox. Tokens remain only in invites, never audit payloads.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_events_id_tenant_uq
  ON tenant_events (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS invites_id_tenant_uq
  ON invites (id, tenant_id);

CREATE TABLE IF NOT EXISTS invite_notification_receipts (
  tenant_event_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invite_notification_receipts_event_fk
    FOREIGN KEY (tenant_event_id, tenant_id)
    REFERENCES tenant_events (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS invite_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_event_id UUID NOT NULL UNIQUE,
  tenant_id UUID NOT NULL,
  invite_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'SKIPPED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invite_notification_deliveries_event_fk
    FOREIGN KEY (tenant_event_id, tenant_id)
    REFERENCES tenant_events (id, tenant_id),
  CONSTRAINT invite_notification_deliveries_invite_fk
    FOREIGN KEY (invite_id, tenant_id)
    REFERENCES invites (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS invite_notification_deliveries_ready_idx
  ON invite_notification_deliveries (next_attempt_at, created_at)
  WHERE status IN ('PENDING','SENDING');
CREATE INDEX IF NOT EXISTS tenant_events_invite_scan_idx
  ON tenant_events (created_at, id) WHERE event_type = 'invite.sent';
