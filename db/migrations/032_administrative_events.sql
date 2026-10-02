-- Separate administrative evidence: never fabricate a ticket or an offboarding event.
CREATE TABLE administrative_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID,
  actor_id UUID, -- NULL only for an anonymous password-reset request; never invent an actor
  subject_user_id UUID,
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 3 AND 80),
  authority_evidence JSONB NOT NULL CHECK (jsonb_typeof(authority_evidence)='object'),
  changes JSONB NOT NULL CHECK (jsonb_typeof(changes)='object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (actor_id IS NOT NULL OR event_type='password.reset_requested'),
  FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,subject_user_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX administrative_events_scope_time ON administrative_events(tenant_id,project_id,occurred_at,id);
CREATE FUNCTION refuse_administrative_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Administrative events are append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER administrative_events_immutable_rows BEFORE UPDATE OR DELETE ON administrative_events
  FOR EACH ROW EXECUTE FUNCTION refuse_administrative_event_mutation();
CREATE TRIGGER administrative_events_immutable_truncate BEFORE TRUNCATE ON administrative_events
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_administrative_event_mutation();