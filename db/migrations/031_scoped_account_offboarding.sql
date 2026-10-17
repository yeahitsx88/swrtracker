-- Scoped lifecycle storage. Additive; no ticket/history/draft/attachment rewrites.
-- Preflight refuses inconsistent legacy identity rows rather than repairing them.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM project_memberships pm JOIN projects p ON p.id=pm.project_id
    JOIN users u ON u.id=pm.user_id WHERE p.tenant_id<>u.tenant_id
  ) THEN RAISE EXCEPTION '031 preflight: project membership crosses tenant; inspect legacy rows before migration'; END IF;
  IF EXISTS (
    SELECT 1 FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id
    WHERE tm.tenant_id<>u.tenant_id
  ) THEN RAISE EXCEPTION '031 preflight: tenant membership crosses tenant; inspect legacy rows before migration'; END IF;
  IF EXISTS (
    SELECT 1 FROM users u LEFT JOIN users actor ON actor.id=u.deactivated_by
    WHERE (u.deactivated_at IS NULL)<>(u.deactivated_by IS NULL)
      OR (u.deactivated_by IS NOT NULL AND actor.tenant_id IS DISTINCT FROM u.tenant_id)
  ) THEN RAISE EXCEPTION '031 preflight: account deactivation provenance is incomplete or crosses tenant'; END IF;
END $$;

ALTER TABLE tenant_memberships ADD CONSTRAINT tenant_memberships_tenant_user_fkey
  FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id);
ALTER TABLE users ADD CONSTRAINT users_deactivation_paired
  CHECK ((deactivated_at IS NULL)=(deactivated_by IS NULL));
ALTER TABLE users ADD CONSTRAINT users_tenant_deactivated_by_fkey
  FOREIGN KEY(tenant_id,deactivated_by) REFERENCES users(tenant_id,id);

ALTER TABLE project_memberships
  ADD COLUMN access_disabled_at TIMESTAMPTZ,
  ADD COLUMN access_disabled_by UUID REFERENCES users(id),
  ADD CONSTRAINT project_memberships_access_disabled_paired
    CHECK ((access_disabled_at IS NULL)=(access_disabled_by IS NULL));

-- Membership has no tenant_id today. Validate the actual project/user/actor
-- identities on every new or changed row, without rewriting retained rows.
CREATE FUNCTION check_project_membership_lifecycle_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE project_tenant UUID; subject_tenant UUID; actor_tenant UUID;
BEGIN
  SELECT tenant_id INTO project_tenant FROM projects WHERE id=NEW.project_id;
  SELECT tenant_id INTO subject_tenant FROM users WHERE id=NEW.user_id;
  IF project_tenant IS NULL OR subject_tenant IS DISTINCT FROM project_tenant THEN
    RAISE EXCEPTION 'Project membership tenant mismatch' USING ERRCODE='23503';
  END IF;
  IF NEW.access_disabled_by IS NOT NULL THEN
    SELECT tenant_id INTO actor_tenant FROM users WHERE id=NEW.access_disabled_by;
    IF actor_tenant IS DISTINCT FROM project_tenant THEN
      RAISE EXCEPTION 'Project access actor tenant mismatch' USING ERRCODE='23503';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_membership_lifecycle_tenant
  BEFORE INSERT OR UPDATE ON project_memberships
  FOR EACH ROW EXECUTE FUNCTION check_project_membership_lifecycle_tenant();

CREATE TABLE project_admin_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN('EXPLICIT','LEGACY_MEMBERSHIP')),
  legacy_membership_id UUID REFERENCES project_memberships(id),
  granted_by UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by UUID,
  revoked_at TIMESTAMPTZ,
  CHECK ((revoked_at IS NULL)=(revoked_by IS NULL)),
  CHECK ((origin='EXPLICIT' AND granted_by IS NOT NULL AND legacy_membership_id IS NULL)
      OR (origin='LEGACY_MEMBERSHIP' AND granted_by IS NULL AND legacy_membership_id IS NOT NULL)),
  FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
  FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id),
  FOREIGN KEY(project_id,user_id) REFERENCES project_memberships(project_id,user_id),
  FOREIGN KEY(tenant_id,granted_by) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,revoked_by) REFERENCES users(tenant_id,id)
);
CREATE UNIQUE INDEX project_admin_grants_active
  ON project_admin_grants(tenant_id,project_id,user_id) WHERE revoked_at IS NULL;
INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,legacy_membership_id,granted_at)
  SELECT p.tenant_id,pm.project_id,pm.user_id,'LEGACY_MEMBERSHIP',pm.id,pm.created_at
  FROM project_memberships pm JOIN projects p ON p.id=pm.project_id
  WHERE pm.role='PROJECT_ADMIN';

CREATE TABLE account_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN('TENANT_ACCOUNT','PROJECT_ACCESS')),
  project_id UUID,
  subject_user_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN('user.deactivated','user.project_access_disabled')),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1),
  reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 1000),
  prior_state TEXT NOT NULL CHECK(prior_state='ACTIVE'),
  new_state TEXT NOT NULL CHECK(new_state='DISABLED'),
  prior_session_version INTEGER NOT NULL CHECK(prior_session_version>=1),
  new_session_version INTEGER NOT NULL CHECK(new_session_version=prior_session_version+1),
  authority_evidence JSONB NOT NULL CHECK(jsonb_typeof(authority_evidence)='object'),
  snapshot TEXT NOT NULL CHECK(length(snapshot)>0),
  correlation_key TEXT NOT NULL CHECK(length(correlation_key) BETWEEN 1 AND 128),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((scope='TENANT_ACCOUNT' AND project_id IS NULL AND event_type='user.deactivated')
      OR (scope='PROJECT_ACCESS' AND project_id IS NOT NULL AND event_type='user.project_access_disabled')),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,project_id,subject_user_id,id),
  FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
  FOREIGN KEY(tenant_id,subject_user_id) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX account_lifecycle_events_subject ON account_lifecycle_events(tenant_id,subject_user_id,occurred_at);
CREATE FUNCTION refuse_account_lifecycle_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Account lifecycle events are append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER account_lifecycle_events_immutable_rows BEFORE UPDATE OR DELETE ON account_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION refuse_account_lifecycle_event_mutation();
CREATE TRIGGER account_lifecycle_events_immutable_truncate BEFORE TRUNCATE ON account_lifecycle_events
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_account_lifecycle_event_mutation();

CREATE TABLE account_offboarding_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  subject_user_id UUID NOT NULL,
  requested_by UUID NOT NULL,
  local_event_id UUID NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 1000),
  recipient_ids UUID[] NOT NULL CHECK(cardinality(recipient_ids)>0 AND array_position(recipient_ids,NULL) IS NULL),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  disposition TEXT CHECK(disposition IN('NO_FURTHER_ACTION','TENANT_ACCOUNT_DISABLED')),
  resolution_reason TEXT,
  tenant_event_id UUID,
  CHECK ((status='PENDING' AND resolved_at IS NULL AND resolved_by IS NULL AND disposition IS NULL
           AND resolution_reason IS NULL AND tenant_event_id IS NULL)
      OR (status='RESOLVED' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL
           AND disposition IS NOT NULL AND resolution_reason IS NOT NULL AND length(btrim(resolution_reason)) BETWEEN 10 AND 1000
           AND ((disposition='NO_FURTHER_ACTION' AND tenant_event_id IS NULL)
             OR (disposition='TENANT_ACCOUNT_DISABLED' AND tenant_event_id IS NOT NULL)))),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
  FOREIGN KEY(tenant_id,subject_user_id) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,requested_by) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,resolved_by) REFERENCES users(tenant_id,id),
  FOREIGN KEY(tenant_id,project_id,subject_user_id,local_event_id)
    REFERENCES account_lifecycle_events(tenant_id,project_id,subject_user_id,id),
  FOREIGN KEY(tenant_id,tenant_event_id) REFERENCES account_lifecycle_events(tenant_id,id)
);
CREATE INDEX account_offboarding_reviews_pending ON account_offboarding_reviews(tenant_id,created_at,id) WHERE status='PENDING';

CREATE TABLE administrative_notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  review_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  CHECK ((lease_token IS NULL)=(lease_until IS NULL)),
  UNIQUE(review_id,recipient_id),
  FOREIGN KEY(tenant_id,review_id) REFERENCES account_offboarding_reviews(tenant_id,id),
  FOREIGN KEY(tenant_id,recipient_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX administrative_notification_outbox_pending
  ON administrative_notification_outbox(available_at,id) WHERE delivered_at IS NULL;

CREATE TABLE project_companies (
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  company_id UUID NOT NULL,
  associated_by UUID NOT NULL,
  associated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(tenant_id,project_id,company_id),
  FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
  FOREIGN KEY(tenant_id,company_id) REFERENCES companies(tenant_id,id),
  FOREIGN KEY(tenant_id,associated_by) REFERENCES users(tenant_id,id)
);

-- Arrays capture the original review recipients, with tenant identity validated
-- independently of application code. Current role changes do not rewrite history.
CREATE FUNCTION validate_offboarding_review_provenance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE recipients_total INTEGER; recipients_unique INTEGER; event_scope TEXT; event_subject UUID;
BEGIN
  SELECT count(*),count(DISTINCT recipient) INTO recipients_total,recipients_unique
    FROM unnest(NEW.recipient_ids) AS recipient;
  IF recipients_total<>recipients_unique THEN
    RAISE EXCEPTION 'Review recipients must be unique' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.recipient_ids) recipient
    WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.tenant_id=NEW.tenant_id AND u.id=recipient)) THEN
    RAISE EXCEPTION 'Review recipient tenant mismatch' USING ERRCODE='23503';
  END IF;
  IF NEW.tenant_event_id IS NOT NULL THEN
    SELECT scope,subject_user_id INTO event_scope,event_subject FROM account_lifecycle_events
      WHERE tenant_id=NEW.tenant_id AND id=NEW.tenant_event_id;
    IF event_scope IS DISTINCT FROM 'TENANT_ACCOUNT' OR event_subject IS DISTINCT FROM NEW.subject_user_id THEN
      RAISE EXCEPTION 'Review resolution requires same subject tenant event' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER offboarding_review_provenance BEFORE INSERT OR UPDATE ON account_offboarding_reviews
  FOR EACH ROW EXECUTE FUNCTION validate_offboarding_review_provenance();

CREATE FUNCTION validate_administrative_outbox_recipient() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE recipients UUID[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE tenant_id=NEW.tenant_id AND id=NEW.recipient_id) THEN
    RAISE EXCEPTION 'Outbox recipient tenant mismatch' USING ERRCODE='23503';
  END IF;
  SELECT recipient_ids INTO recipients FROM account_offboarding_reviews
    WHERE tenant_id=NEW.tenant_id AND id=NEW.review_id;
  IF recipients IS NOT NULL AND NOT(NEW.recipient_id=ANY(recipients)) THEN
    RAISE EXCEPTION 'Outbox recipient not in review' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER administrative_outbox_recipient BEFORE INSERT OR UPDATE ON administrative_notification_outbox
  FOR EACH ROW EXECUTE FUNCTION validate_administrative_outbox_recipient();
