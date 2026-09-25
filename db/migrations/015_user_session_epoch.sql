-- Incrementing this epoch invalidates all previously issued user sessions.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- Also handles a partially provisioned column on a repeated deployment.
UPDATE users SET session_version = 0 WHERE session_version IS NULL;
ALTER TABLE users ALTER COLUMN session_version SET DEFAULT 0;
ALTER TABLE users ALTER COLUMN session_version SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND conname = 'users_session_version_nonnegative_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_session_version_nonnegative_check
      CHECK (session_version >= 0);
  END IF;
END $$;
