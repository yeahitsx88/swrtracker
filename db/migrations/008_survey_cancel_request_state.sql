-- Migration 008: persist survey-side cancellation request metadata
-- Allows PARTY_CHIEF and SURVEY_SUPERINTENDENT initiated survey cancels
-- to await approval without inventing a separate workflow status.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS survey_cancel_requested_by UUID REFERENCES users(id);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS survey_cancel_requested_role TEXT;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS survey_cancel_reason TEXT;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS survey_cancel_requested_at TIMESTAMPTZ;
