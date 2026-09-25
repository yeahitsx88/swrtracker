-- Capture the ticket state when an attachment is uploaded. Historical uploads
-- predate this field; their upload-time state cannot be reconstructed safely.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS ticket_status_at_upload TEXT;
UPDATE attachments SET ticket_status_at_upload = 'LEGACY_UNKNOWN'
WHERE ticket_status_at_upload IS NULL;
ALTER TABLE attachments ALTER COLUMN ticket_status_at_upload SET NOT NULL;

CREATE INDEX IF NOT EXISTS attachments_tenant_ticket_created_idx
  ON attachments (tenant_id, ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attachments_tenant_storage_key_idx
  ON attachments (tenant_id, storage_key);
