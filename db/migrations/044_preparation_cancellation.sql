-- Decision54 D6. Initial SETUP and reopening preparation share governed cancellation.
ALTER TABLE project_recommissioning ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE project_recommissioning ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);
CREATE UNIQUE INDEX IF NOT EXISTS project_recommissioning_scope_id ON project_recommissioning(tenant_id,project_id,id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='project_recommissioning'::regclass AND conname='recommissioning_cancellation_identity') THEN
  ALTER TABLE project_recommissioning ADD CONSTRAINT recommissioning_cancellation_identity CHECK((cancelled_at IS NULL)=(cancelled_by IS NULL) AND NOT(opened_at IS NOT NULL AND cancelled_at IS NOT NULL));
  ALTER TABLE project_recommissioning ADD CONSTRAINT recommissioning_cancellation_actor FOREIGN KEY(tenant_id,cancelled_by) REFERENCES users(tenant_id,id);
 END IF;
END $$;
DROP INDEX IF EXISTS project_recommissioning_pending;
CREATE UNIQUE INDEX project_recommissioning_pending ON project_recommissioning(tenant_id,project_id) WHERE opened_at IS NULL AND cancelled_at IS NULL;
CREATE TABLE IF NOT EXISTS project_preparation_cancellations(
 id UUID PRIMARY KEY,tenant_id UUID NOT NULL REFERENCES tenants(id),project_id UUID NOT NULL,recommissioning_id UUID,
 started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),started_by UUID NOT NULL,reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),
 reviewed_evidence JSONB NOT NULL CHECK(jsonb_typeof(reviewed_evidence)='object'),
 completed_at TIMESTAMPTZ,completed_by UUID,completion_evidence JSONB,
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id,recommissioning_id) REFERENCES project_recommissioning(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,started_by) REFERENCES users(tenant_id,id),FOREIGN KEY(tenant_id,completed_by) REFERENCES users(tenant_id,id),
 CHECK((completed_at IS NULL)=(completed_by IS NULL) AND (completed_at IS NULL)=(completion_evidence IS NULL)),
 CHECK(completion_evidence IS NULL OR jsonb_typeof(completion_evidence)='object')
);
CREATE UNIQUE INDEX IF NOT EXISTS preparation_cancellation_pending ON project_preparation_cancellations(tenant_id,project_id) WHERE completed_at IS NULL;
CREATE OR REPLACE FUNCTION protect_preparation_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Preparation cancellation evidence cannot be removed'; END IF;
 IF OLD.completed_at IS NOT NULL OR NEW.completed_at IS NULL OR
  (to_jsonb(NEW)-'completed_at'-'completed_by'-'completion_evidence') IS DISTINCT FROM (to_jsonb(OLD)-'completed_at'-'completed_by'-'completion_evidence') THEN
  RAISE EXCEPTION 'Only first cancellation completion may update evidence';
 END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS preparation_cancellation_immutable ON project_preparation_cancellations;
CREATE TRIGGER preparation_cancellation_immutable BEFORE UPDATE OR DELETE ON project_preparation_cancellations FOR EACH ROW EXECUTE FUNCTION protect_preparation_cancellation();
DROP TRIGGER IF EXISTS preparation_cancellation_no_truncate ON project_preparation_cancellations;
CREATE TRIGGER preparation_cancellation_no_truncate BEFORE TRUNCATE ON project_preparation_cancellations FOR EACH STATEMENT EXECUTE FUNCTION protect_preparation_cancellation();
CREATE OR REPLACE FUNCTION protect_recommissioning_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Recommissioning evidence cannot be removed'; END IF;
 IF OLD.opened_at IS NOT NULL OR OLD.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Completed preparation evidence is immutable'; END IF;
 IF NEW.opened_at IS NOT NULL AND NEW.cancelled_at IS NULL AND
  (to_jsonb(NEW)-'opened_at'-'opened_by') IS NOT DISTINCT FROM (to_jsonb(OLD)-'opened_at'-'opened_by') THEN RETURN NEW; END IF;
 IF NEW.cancelled_at IS NOT NULL AND NEW.opened_at IS NULL AND
  (to_jsonb(NEW)-'cancelled_at'-'cancelled_by') IS NOT DISTINCT FROM (to_jsonb(OLD)-'cancelled_at'-'cancelled_by') AND EXISTS(
   SELECT 1 FROM project_preparation_cancellations c WHERE c.tenant_id=NEW.tenant_id AND c.project_id=NEW.project_id AND c.recommissioning_id=NEW.id AND c.completed_at IS NOT NULL AND c.completed_by=NEW.cancelled_by
  ) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Only first opening or evidenced cancellation may close preparation';
END $$;
