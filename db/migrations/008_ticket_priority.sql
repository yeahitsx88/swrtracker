-- Replace the legacy priority flag with the four-level operational priority.
-- Existing flagged tickets retain HIGH priority; unflagged tickets become NORMAL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'tickets'
      AND column_name = 'priority'
  ) THEN
    ALTER TABLE tickets ADD COLUMN priority TEXT NOT NULL DEFAULT 'NORMAL';
    UPDATE tickets SET priority = 'HIGH' WHERE is_priority = TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'tickets'
      AND column_name = 'priority_set_by'
  ) THEN
    ALTER TABLE tickets ADD COLUMN priority_set_by UUID;
    UPDATE tickets SET priority_set_by = priority_elevated_by
    WHERE priority_elevated_by IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'tickets'
      AND column_name = 'priority_set_reason'
  ) THEN
    ALTER TABLE tickets ADD COLUMN priority_set_reason TEXT;
    UPDATE tickets SET priority_set_reason = priority_elevated_reason
    WHERE priority_elevated_reason IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tickets'::regclass
      AND conname = 'tickets_priority_check'
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_priority_check
      CHECK (priority IN ('HIGH', 'MED_HIGH', 'MEDIUM', 'NORMAL'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tickets'::regclass
      AND conname = 'tickets_priority_set_by_tenant_fk'
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT tickets_priority_set_by_tenant_fk
      FOREIGN KEY (priority_set_by, tenant_id)
      REFERENCES users (id, tenant_id) NOT VALID;
  END IF;
END $$;
