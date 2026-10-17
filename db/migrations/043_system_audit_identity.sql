-- Decision54 D8. Preserve existing historical actor values and append-only evidence.
ALTER TABLE ticket_events ADD COLUMN IF NOT EXISTS actor_kind TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE ticket_events ALTER COLUMN actor_id DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ticket_events'::regclass AND conname='ticket_events_actor_identity') THEN
  ALTER TABLE ticket_events ADD CONSTRAINT ticket_events_actor_identity CHECK (
   (actor_kind='USER' AND actor_id IS NOT NULL) OR (actor_kind='SYSTEM' AND actor_id IS NULL)
  );
 END IF;
END $$;
