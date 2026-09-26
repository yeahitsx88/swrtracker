-- Retain project filtering after physical draft deletion. Historical tombstones
-- without project context remain readable in the unfiltered tenant audit log.
ALTER TABLE ticket_draft_tombstones ADD COLUMN IF NOT EXISTS project_id UUID;

CREATE INDEX IF NOT EXISTS ticket_events_tenant_chronology_idx
  ON ticket_events (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS tenant_events_tenant_chronology_idx
  ON tenant_events (tenant_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION validate_draft_tombstone_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT t.project_id INTO NEW.project_id FROM tickets t
  WHERE t.id = NEW.ticket_id AND t.tenant_id = NEW.tenant_id
    AND t.status = 'DRAFT'
    AND t.draft_deleted_at < NOW() - INTERVAL '30 days'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft tombstone requires an expired soft-deleted draft';
  END IF;
  RETURN NEW;
END $$;
