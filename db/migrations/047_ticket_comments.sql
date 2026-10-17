-- Conversation on a request between the requester and survey/CAD staff.
-- Comments are part of the request record: append-only, never edited or deleted.
CREATE TABLE ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  ticket_id UUID NOT NULL,
  author_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tickets(tenant_id, id),
  FOREIGN KEY (tenant_id, author_id) REFERENCES users(tenant_id, id)
);
CREATE INDEX ticket_comments_thread ON ticket_comments(tenant_id, ticket_id, created_at, id);

CREATE FUNCTION refuse_ticket_comment_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Ticket comments are append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER ticket_comments_immutable_rows BEFORE UPDATE OR DELETE ON ticket_comments
  FOR EACH ROW EXECUTE FUNCTION refuse_ticket_comment_mutation();
CREATE TRIGGER ticket_comments_immutable_truncate BEFORE TRUNCATE ON ticket_comments
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_ticket_comment_mutation();
