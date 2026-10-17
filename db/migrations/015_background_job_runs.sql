CREATE TABLE IF NOT EXISTS background_job_runs (
  id UUID PRIMARY KEY,
  tenant_id UUID NULL,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STARTED', 'SUCCEEDED', 'FAILED')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ NULL,
  error_message TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_background_job_runs_job_name_started_at
  ON background_job_runs (job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_background_job_runs_status_started_at
  ON background_job_runs (status, started_at DESC);
