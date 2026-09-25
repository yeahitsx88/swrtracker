-- Explicit partial drafts and submission-time numbering. Existing completed rows remain valid.
ALTER TABLE tickets ALTER COLUMN ticket_number DROP NOT NULL;
ALTER TABLE tickets ALTER COLUMN ticket_type DROP NOT NULL;
ALTER TABLE tickets ALTER COLUMN craft DROP NOT NULL;
ALTER TABLE tickets ALTER COLUMN description DROP NOT NULL;
ALTER TABLE tickets ALTER COLUMN requested_date DROP NOT NULL;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS draft_last_saved_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS draft_deleted_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS draft_deleted_reason TEXT;

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_draft_deleted_reason_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_draft_deleted_reason_check
  CHECK (draft_deleted_reason IS NULL OR
    draft_deleted_reason IN ('REQUESTER_DELETED','USER_DEACTIVATED','AUTO_EXPIRED'));
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_draft_deleted_pair_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_draft_deleted_pair_check
  CHECK ((draft_deleted_at IS NULL) = (draft_deleted_reason IS NULL));

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_location_source_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_location_source_check CHECK (
  (status = 'DRAFT' AND area_id IS NULL AND subarea_id IS NULL)
  OR (aor_node_id IS NOT NULL AND area_id IS NULL AND subarea_id IS NULL)
  OR (aor_node_id IS NULL AND area_id IS NOT NULL AND subarea_id IS NOT NULL)
) NOT VALID;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_submitted_required_fields_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_submitted_required_fields_check CHECK (
  status = 'DRAFT' OR
  (ticket_number IS NOT NULL AND ticket_type IS NOT NULL AND
   craft IS NOT NULL AND description IS NOT NULL AND requested_date IS NOT NULL)
) NOT VALID;

CREATE INDEX IF NOT EXISTS tickets_active_drafts_by_requester_idx
  ON tickets(tenant_id, requester_id, project_id, draft_last_saved_at DESC)
  WHERE status='DRAFT' AND draft_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tickets_deleted_drafts_idx
  ON tickets(tenant_id, project_id, draft_deleted_at)
  WHERE status='DRAFT' AND draft_deleted_at IS NOT NULL;
