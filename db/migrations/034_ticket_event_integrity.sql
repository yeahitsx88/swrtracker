-- Enforce the existing append-only, tenant-bound ticket history invariant.
-- Refuse inconsistent legacy rows; never repair, delete or rewrite evidence.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM ticket_events e
    LEFT JOIN tickets t ON t.id=e.ticket_id AND t.tenant_id=e.tenant_id
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Ticket event tenant ownership is inconsistent; investigate before applying034';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ticket_events'::regclass AND conname='ticket_events_tenant_ticket_fk') THEN
    ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_tenant_ticket_fk
      FOREIGN KEY(tenant_id,ticket_id) REFERENCES tickets(tenant_id,id);
  END IF;
  -- Keep the existing actor FK: workers use one configured service actor across
  -- tenants. Changing that attribution model needs an approved worker contract.
END $$;

CREATE OR REPLACE FUNCTION refuse_ticket_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Ticket events are append-only' USING ERRCODE='55000';
END $$;
DROP TRIGGER IF EXISTS ticket_events_immutable_rows ON ticket_events;
CREATE TRIGGER ticket_events_immutable_rows BEFORE UPDATE OR DELETE ON ticket_events
  FOR EACH ROW EXECUTE FUNCTION refuse_ticket_event_mutation();
DROP TRIGGER IF EXISTS ticket_events_immutable_truncate ON ticket_events;
CREATE TRIGGER ticket_events_immutable_truncate BEFORE TRUNCATE ON ticket_events
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_ticket_event_mutation();
