-- Preserve append-only history and ordinary actor requirements. Axiom support
-- has database operator access, not an invented tenant user or web role.
ALTER TABLE administrative_events DROP CONSTRAINT administrative_events_check;
ALTER TABLE administrative_events ADD CONSTRAINT administrative_events_check CHECK (
 actor_id IS NOT NULL OR event_type='password.reset_requested' OR COALESCE((
  event_type='tenant.home_organization_changed' AND project_id IS NULL
  AND subject_user_id IS NULL AND authority_evidence->>'operator'='AXIOM_SUPPORT'
  AND jsonb_typeof(authority_evidence->'caseReference')='string'
  AND length(btrim(authority_evidence->>'caseReference')) BETWEEN 1 AND 200
 ),FALSE)
);
