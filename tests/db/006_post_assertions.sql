-- Apply after 006_upgrade_fixture.sql and migration 006 in a disposable database.
DO $$
DECLARE
  single_domain_company UUID;
  multi_domain_company UUID;
BEGIN
  IF (SELECT COUNT(*) FROM project_memberships WHERE role = 'SURVEY_MANAGER') <> 1
     OR (SELECT COUNT(*) FROM project_memberships WHERE role = 'VIEWER') <> 1
     OR EXISTS (SELECT 1 FROM project_memberships WHERE role IN ('SURVEY_LEAD', 'APPROVER')) THEN
    RAISE EXCEPTION 'Legacy project roles were not migrated correctly';
  END IF;

  SELECT company_id INTO single_domain_company FROM allowed_domains
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
  SELECT company_id INTO multi_domain_company FROM allowed_domains
    WHERE tenant_id = '00000000-0000-0000-0000-000000000002';
  IF single_domain_company IS DISTINCT FROM '00000000-0000-0000-0000-000000000011'::UUID
     OR multi_domain_company IS NOT NULL THEN
    RAISE EXCEPTION 'Historical domain binding was not scoped safely';
  END IF;
END $$;

INSERT INTO areas (id, project_id, tenant_id, name, code) VALUES
  ('00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000211',
   '00000000-0000-0000-0000-000000000001', 'Area', 'A1');
INSERT INTO subareas (id, area_id, project_id, tenant_id, name) VALUES
  ('00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000311',
   '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000001', 'Subarea');
INSERT INTO tickets (
  id, tenant_id, project_id, area_id, subarea_id, company_id, ticket_number,
  requester_id, workflow_variant, status, craft, description, requested_date, ticket_type
) VALUES (
  '00000000-0000-0000-0000-000000000511', '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000311',
  '00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000011',
  'FSS-A1-00001', '00000000-0000-0000-0000-000000000111',
  'STANDARD_APPROVAL', 'DRAFT', 'Pipe', 'Fixture', CURRENT_DATE, 'LAYOUT'
);
INSERT INTO ticket_events (id, ticket_id, tenant_id, actor_id, event_type) VALUES
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000511',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000111', 'ticket.created');
INSERT INTO tenant_events (id, tenant_id, actor_id, event_type) VALUES
  ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000111', 'domain.added');

DO $$
BEGIN
  BEGIN
    UPDATE users SET company_id = '00000000-0000-0000-0000-000000000021'
      WHERE id = '00000000-0000-0000-0000-000000000111';
    RAISE EXCEPTION 'Cross-tenant user company update unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    UPDATE tickets SET company_id = '00000000-0000-0000-0000-000000000021'
      WHERE id = '00000000-0000-0000-0000-000000000511';
    RAISE EXCEPTION 'Cross-tenant ticket company update unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    UPDATE allowed_domains SET company_id = '00000000-0000-0000-0000-000000000021'
      WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Cross-tenant domain binding unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    UPDATE ticket_events SET event_type = 'mutated'
      WHERE id = '00000000-0000-0000-0000-000000000611';
    RAISE EXCEPTION 'Ticket event update unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'audit event log is append-only' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM ticket_events WHERE id = '00000000-0000-0000-0000-000000000611';
    RAISE EXCEPTION 'Ticket event delete unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'audit event log is append-only' THEN RAISE; END IF;
  END;

  BEGIN
    TRUNCATE ticket_events;
    RAISE EXCEPTION 'Ticket event truncate unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'audit event log is append-only' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE tenant_events SET event_type = 'mutated'
      WHERE id = '00000000-0000-0000-0000-000000000711';
    RAISE EXCEPTION 'Tenant event update unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'audit event log is append-only' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM tenant_events WHERE id = '00000000-0000-0000-0000-000000000711';
    RAISE EXCEPTION 'Tenant event delete unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'audit event log is append-only' THEN RAISE; END IF;
  END;

  BEGIN
    TRUNCATE tenant_events;
    RAISE EXCEPTION 'Tenant event truncate unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'audit event log is append-only' THEN RAISE; END IF;
  END;
END $$;
