-- General Level 2 overload signals have no ticket. Preserve tenant-scoped
-- reference validation and require a real flag for these project-level events.
ALTER TABLE ticket_events ALTER COLUMN ticket_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION validate_ticket_event_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_id IS NULL THEN
    IF NEW.event_type NOT IN ('help_flag.raised','help_flag.escalated','help_flag.cleared')
       OR NOT EXISTS (
         SELECT 1 FROM help_flags h
         WHERE h.id = (NEW.payload->>'flagId')::uuid
           AND h.tenant_id = NEW.tenant_id
           AND h.project_id = (NEW.payload->>'projectId')::uuid
           AND h.level = 2 AND cardinality(h.affected_ticket_ids) = 0
       ) THEN
      RAISE EXCEPTION 'ticketless event requires a general Level 2 flag in the same tenant and project';
    END IF;
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = NEW.ticket_id AND t.tenant_id = NEW.tenant_id
  ) AND NOT EXISTS (
    SELECT 1 FROM ticket_draft_tombstones d
    WHERE d.ticket_id = NEW.ticket_id AND d.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'ticket event requires a live ticket or purged draft ID in the same tenant';
  END IF;
  RETURN NULL;
END $$;
