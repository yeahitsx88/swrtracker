-- Partial intake is permitted only before first submission. Existing work is not rewritten.
ALTER TABLE tickets ALTER COLUMN aor_node_id DROP NOT NULL;
ALTER TABLE tickets ALTER COLUMN ticket_type DROP NOT NULL;
ALTER TABLE tickets ALTER COLUMN requested_date DROP NOT NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS draft_last_saved_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS draft_deleted_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS draft_deleted_reason text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'tickets'::regclass AND conname = 'tickets_submitted_intake_present') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_submitted_intake_present CHECK
      (status = 'DRAFT' OR (aor_node_id IS NOT NULL AND ticket_type IS NOT NULL AND requested_date IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'tickets'::regclass AND conname = 'tickets_draft_deletion_consistent') THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_draft_deletion_consistent CHECK
      ((draft_deleted_at IS NULL AND draft_deleted_reason IS NULL) OR
       (status = 'DRAFT' AND draft_deleted_at IS NOT NULL AND draft_deleted_reason = 'REQUESTER_DELETED'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_tickets_current_requester_drafts
  ON tickets (tenant_id, project_id, requester_id, updated_at DESC)
  WHERE status = 'DRAFT' AND draft_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_deleted_drafts
  ON tickets (tenant_id, project_id, draft_deleted_at DESC)
  WHERE draft_deleted_at IS NOT NULL;
-- Normal visibility now filters this new, initially all-null column. Without
-- statistics PostgreSQL estimates a tiny surviving population and can choose
-- a quadratic historical-review provenance join until automatic analysis runs.
ANALYZE tickets (draft_deleted_at);
-- No automatic expiry, permanent deletion or attachment purge is authorized.
