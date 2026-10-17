-- Additive handover evidence on existing responsibility events only.
-- Historical events retain NULL; existing action meanings remain unchanged.
ALTER TABLE access_grant_events
  ADD COLUMN resolution_evidence JSONB,
  ADD CONSTRAINT access_grant_events_resolution_evidence_check
    CHECK (resolution_evidence IS NULL OR (
      jsonb_typeof(resolution_evidence) = 'object'
      AND action IN ('RESPONSIBILITY_GRANTED', 'RESPONSIBILITY_REVOKED')
    ));
