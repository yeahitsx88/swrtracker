-- Project request configuration (lead-time policy)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS lead_time_enforcement_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER NOT NULL DEFAULT 2;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_lead_time_days_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_lead_time_days_check
  CHECK (lead_time_days BETWEEN 1 AND 30);

-- Ticket coordination fields
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS field_contact TEXT;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS field_channel TEXT;

