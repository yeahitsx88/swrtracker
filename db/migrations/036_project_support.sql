-- Separate help desk records: survey requests and their workflow history are untouched.
CREATE TABLE project_support_tickets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id UUID NOT NULL REFERENCES tenants(id),project_id UUID NOT NULL,requester_id UUID NOT NULL,
 subject TEXT NOT NULL CHECK(length(subject) BETWEEN 3 AND 120),description TEXT NOT NULL CHECK(length(description) BETWEEN 10 AND 4000),
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','RESOLVED','ESCALATED')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),FOREIGN KEY(tenant_id,requester_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX support_project_queue ON project_support_tickets(tenant_id,project_id,status,created_at,id);
CREATE INDEX support_requester_queue ON project_support_tickets(tenant_id,requester_id,created_at,id);
CREATE TABLE project_support_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id UUID NOT NULL,ticket_id UUID NOT NULL,actor_id UUID NOT NULL,
 message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 4000),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,ticket_id) REFERENCES project_support_tickets(tenant_id,id),FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX support_transcript ON project_support_messages(tenant_id,ticket_id,created_at,id);
CREATE FUNCTION refuse_support_message_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Help desk conversations are append-only' USING ERRCODE='55000'; END $$;
CREATE TRIGGER support_messages_immutable BEFORE UPDATE OR DELETE ON project_support_messages FOR EACH ROW EXECUTE FUNCTION refuse_support_message_mutation();
CREATE TRIGGER support_messages_immutable_truncate BEFORE TRUNCATE ON project_support_messages FOR EACH STATEMENT EXECUTE FUNCTION refuse_support_message_mutation();

-- Metadata only: never store cookies, request bodies, file contents, SQL or stacks.
CREATE TABLE project_request_observations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id UUID NOT NULL,project_id UUID NOT NULL,actor_id UUID NOT NULL,
 route TEXT NOT NULL CHECK(length(route)<=240),method TEXT NOT NULL CHECK(method IN ('GET','POST','PATCH','PUT','DELETE')),
 status INTEGER NOT NULL CHECK(status BETWEEN 100 AND 599),duration_ms DOUBLE PRECISION NOT NULL CHECK(duration_ms>=0 AND duration_ms<86400000),
 correlation_id UUID NOT NULL,error_code TEXT,ticket_id UUID,prior_status TEXT,observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,ticket_id) REFERENCES tickets(tenant_id,id)
);
CREATE INDEX observations_project_time ON project_request_observations(tenant_id,project_id,observed_at DESC,id);
