-- Retain immutable ticket events after the 30-day physical purge of a soft-deleted
-- draft. Tombstones hold only IDs of drafts purged in the same transaction.

CREATE TABLE IF NOT EXISTS ticket_draft_tombstones (
  ticket_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  purged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attachment_purge_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ticket_id UUID NOT NULL,
  storage_key TEXT NOT NULL CHECK (length(storage_key) > 0),
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  UNIQUE (tenant_id, storage_key)
);
CREATE INDEX IF NOT EXISTS attachment_purge_queue_pending_idx
  ON attachment_purge_queue (enqueued_at, id)
  WHERE processed_at IS NULL;

-- A tombstone may be created only for an eligible draft. The deferred check
-- below prevents it being committed without the corresponding ticket deletion.
CREATE OR REPLACE FUNCTION validate_draft_tombstone_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = NEW.ticket_id AND t.tenant_id = NEW.tenant_id
      AND t.status = 'DRAFT'
      AND t.draft_deleted_at < NOW() - INTERVAL '30 days'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'draft tombstone requires an expired soft-deleted draft';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_draft_tombstone_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM tickets WHERE id = NEW.ticket_id) THEN
    RAISE EXCEPTION 'draft tombstone must be committed with ticket deletion';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION guard_ticket_draft_purge()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' OR
     OLD.draft_deleted_at IS NULL OR
     OLD.draft_deleted_at >= NOW() - INTERVAL '30 days' OR
     NOT EXISTS (
       SELECT 1 FROM ticket_draft_tombstones d
       WHERE d.ticket_id = OLD.id AND d.tenant_id = OLD.tenant_id
     ) THEN
    RAISE EXCEPTION 'tickets may be deleted only through 30-day draft purge';
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION guard_tombstoned_ticket_reuse()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM ticket_draft_tombstones WHERE ticket_id = NEW.id) THEN
    RAISE EXCEPTION 'purged draft ticket IDs may not be reused';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION deny_ticket_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ticket IDs and tenant ownership are immutable';
END $$;

CREATE OR REPLACE FUNCTION deny_ticket_truncate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ticket truncate bypasses draft-retention checks';
END $$;

-- New events must name a live ticket or a permanently retained draft ID, in
-- the same tenant. The old FK cannot remain because a purged draft has no row.
CREATE OR REPLACE FUNCTION validate_ticket_event_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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

-- Existing event rows must satisfy the stronger tenant-scoped reference check.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ticket_events e
    WHERE NOT EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = e.ticket_id AND t.tenant_id = e.tenant_id
    ) AND NOT EXISTS (
      SELECT 1 FROM ticket_draft_tombstones d
      WHERE d.ticket_id = e.ticket_id AND d.tenant_id = e.tenant_id
    )
  ) THEN
    RAISE EXCEPTION 'ticket_events contains a missing or cross-tenant ticket reference';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ticket_draft_tombstone_insert') THEN
    CREATE TRIGGER ticket_draft_tombstone_insert
      BEFORE INSERT ON ticket_draft_tombstones
      FOR EACH ROW EXECUTE FUNCTION validate_draft_tombstone_insert();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ticket_draft_tombstone_commit') THEN
    CREATE CONSTRAINT TRIGGER ticket_draft_tombstone_commit
      AFTER INSERT ON ticket_draft_tombstones
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_draft_tombstone_commit();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tickets_draft_purge_guard') THEN
    CREATE TRIGGER tickets_draft_purge_guard
      BEFORE DELETE ON tickets
      FOR EACH ROW EXECUTE FUNCTION guard_ticket_draft_purge();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tickets_no_tombstone_reuse') THEN
    CREATE TRIGGER tickets_no_tombstone_reuse
      BEFORE INSERT ON tickets
      FOR EACH ROW EXECUTE FUNCTION guard_tombstoned_ticket_reuse();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tickets_immutable_identity') THEN
    CREATE TRIGGER tickets_immutable_identity
      BEFORE UPDATE OF id, tenant_id ON tickets
      FOR EACH ROW EXECUTE FUNCTION deny_ticket_identity_change();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tickets_no_truncate') THEN
    CREATE TRIGGER tickets_no_truncate
      BEFORE TRUNCATE ON tickets
      FOR EACH STATEMENT EXECUTE FUNCTION deny_ticket_truncate();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'draft_tombstones_append_only') THEN
    CREATE TRIGGER draft_tombstones_append_only
      BEFORE UPDATE OR DELETE ON ticket_draft_tombstones
      FOR EACH ROW EXECUTE FUNCTION deny_ticket_event_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'draft_tombstones_no_truncate') THEN
    CREATE TRIGGER draft_tombstones_no_truncate
      BEFORE TRUNCATE ON ticket_draft_tombstones
      FOR EACH STATEMENT EXECUTE FUNCTION deny_ticket_event_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ticket_events_reference_check') THEN
    CREATE CONSTRAINT TRIGGER ticket_events_reference_check
      AFTER INSERT ON ticket_events
      DEFERRABLE INITIALLY IMMEDIATE
      FOR EACH ROW EXECUTE FUNCTION validate_ticket_event_reference();
  END IF;
END $$;

ALTER TABLE ticket_events DROP CONSTRAINT IF EXISTS ticket_events_ticket_id_fkey;
