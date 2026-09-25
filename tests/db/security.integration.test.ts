import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import type { UUID } from '@/shared/types';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import { requestCancel } from '@/modules/ticket/application/request-cancel';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import { createProject } from '@/modules/tenancy/application/create-project';
import { createAorLevel } from '@/modules/tenancy/application/create-aor-level';
import { createAorNode } from '@/modules/tenancy/application/create-aor-node';
import { assignAorSuperintendent } from '@/modules/tenancy/application/assign-aor-superintendent';
import { activateProject } from '@/modules/tenancy/application/activate-project';
import { submitFieldStatus, resolveFieldStatus } from '@/modules/ticket/application/field-status';
import { initiateSurveyCancel, approveSurveyCancel } from '@/modules/ticket/application/survey-cancel';

const id = () => randomUUID() as UUID;

test('PostgreSQL tenant boundaries, visibility, transition audit, and domain binding',
  { skip: !process.env.DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    try {
      const tenantId = id();
      const projectId = id();
      const gcCompanyId = id();
      const subCompanyId = id();
      const gcUserId = id();
      const subUserId = id();
      const aorLevelId = id();
      const aorNodeId = id();
      const departmentId = id();

      await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [tenantId, 'Integration tenant']);
      await client.query(
        `INSERT INTO companies (id, tenant_id, name, type) VALUES
         ($1, $3, 'GC', 'GC'), ($2, $3, 'Sub', 'SUBCONTRACTOR')`,
        [gcCompanyId, subCompanyId, tenantId],
      );
      await client.query(
        `INSERT INTO users (id, tenant_id, company_id, email, password_hash, name) VALUES
         ($1, $3, $4, 'gc@example.com', 'fixture', 'GC User'),
         ($2, $3, $5, 'sub@example.org', 'fixture', 'Sub User')`,
        [gcUserId, subUserId, tenantId, gcCompanyId, subCompanyId],
      );
      await client.query(
        `INSERT INTO projects (id, tenant_id, name, status, crew_build)
         VALUES ($1, $2, 'Project', 'ACTIVE', 'MEDIUM')`,
        [projectId, tenantId],
      );
      await client.query(
        `INSERT INTO aor_levels (id, project_id, tenant_id, depth, label)
         VALUES ($1, $2, $3, 0, 'Area')`, [aorLevelId, projectId, tenantId],
      );
      await client.query(
        `INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, name, code)
         VALUES ($1, $2, $3, $4, 'Area', 'A1')`, [aorNodeId, projectId, tenantId, aorLevelId],
      );
      await client.query(`INSERT INTO departments
        (id, project_id, tenant_id, name, manager_title, created_by)
        VALUES ($1,$2,$3,'Civil','Civil Manager',$4)`,
        [departmentId, projectId, tenantId, gcUserId]);
      await client.query(`INSERT INTO department_titles
        (tenant_id, department_id, title, default_priority, assignment_layer)
        VALUES ($1,$2,'Civil Manager','MED_HIGH','MANAGER')`, [tenantId, departmentId]);
      await client.query(`INSERT INTO department_memberships
        (project_id, tenant_id, user_id, department_id, title, assigned_by, assigned_at)
        VALUES ($1,$2,$3,$4,'Civil Manager',$3,NOW())`,
        [projectId, tenantId, gcUserId, departmentId]);
      await client.query(
        `INSERT INTO project_memberships (project_id, user_id, role) VALUES
         ($1, $2, 'REQUESTER'), ($1, $3, 'REQUESTER')`, [projectId, gcUserId, subUserId],
      );
      await client.query(
        `INSERT INTO allowed_domains (tenant_id, company_id, domain, added_by)
         VALUES ($1, $2, 'example.org', $3)`, [tenantId, subCompanyId, gcUserId],
      );

      const users = new UserRepository();
      assert.equal(await users.isDomainAllowed(client, tenantId, subCompanyId, 'sub@example.org'), true);
      assert.equal(await users.isDomainAllowed(client, tenantId, gcCompanyId, 'gc@example.org'), false);

      const repo = new TicketRepository();
      const create = (requesterId: UUID, companyId: UUID, email: string,
        selectedDepartmentId?: UUID) => createTicket(repo, client, {
        tenantId, projectId, aorNodeId, companyId, requesterId,
        departmentId: selectedDepartmentId,
        requesterEmail: email, ticketType: 'LAYOUT', workflowVariant: 'DIRECT_ASSIGNMENT',
        craft: 'Pipe', description: 'Integration fixture', requestedDate: new Date('2026-10-01'),
      });
      const gcTicket = await create(gcUserId, gcCompanyId, 'gc@example.com');
      const subTicket = await create(subUserId, subCompanyId, 'sub@example.org', departmentId);
      await assert.rejects(create(subUserId, gcCompanyId, 'sub@example.org'));
      await assert.rejects(create(subUserId, subCompanyId, 'sub@example.org', id()));
      assert.equal(gcTicket.departmentId, departmentId);
      assert.equal(gcTicket.priority, 'MED_HIGH');
      assert.equal(subTicket.priority, 'NORMAL');

      // Elevated read roles are assigned after requester-only ticket creation.
      await client.query(`UPDATE project_memberships SET role='VIEWER'
        WHERE project_id=$1 AND user_id IN ($2,$3)`,
        [projectId, gcUserId, subUserId]);

      const subScope = {
        actorId: subUserId, actorRole: 'VIEWER' as const,
        companyId: subCompanyId, companyType: 'SUBCONTRACTOR' as const,
      };
      const gcScope = {
        actorId: gcUserId, actorRole: 'VIEWER' as const,
        companyId: gcCompanyId, companyType: 'GC' as const,
      };
      assert.equal((await repo.list(client, tenantId, {
        projectId, visibility: subScope, limit: 20, offset: 0,
      })).total, 1);
      assert.equal(await repo.findById(client, tenantId, gcTicket.id, subScope), null);
      assert.equal((await repo.list(client, tenantId, {
        projectId, visibility: gcScope, limit: 20, offset: 0,
      })).total, 2);

      const canceled = await requestCancel(repo, client, {
        tenantId, ticketId: subTicket.id, actorId: subUserId, actorRole: 'VIEWER',
      });
      assert.equal(canceled.status, 'REQUESTER_CANCELED');
      const { rows: stateRows } = await client.query<{ status: string; canceled_at: Date | null }>(
        'SELECT status, canceled_at FROM tickets WHERE id = $1', [subTicket.id],
      );
      const state = stateRows[0];
      assert.ok(state);
      assert.equal(state.status, 'REQUESTER_CANCELED');
      assert.ok(state.canceled_at);
      const { rows: eventRows } = await client.query<{ event_type: string }>(
        'SELECT event_type FROM ticket_events WHERE ticket_id = $1 ORDER BY created_at', [subTicket.id],
      );
      assert.ok(eventRows.some((row) => row.event_type === 'ticket.requester_canceled'));

      await client.query('SAVEPOINT audit_probe');
      await assert.rejects(client.query(
        "UPDATE ticket_events SET event_type = 'mutated' WHERE ticket_id = $1", [subTicket.id],
      ), (error: unknown) => (error as { code?: string }).code === 'P0001');
      await client.query('ROLLBACK TO SAVEPOINT audit_probe');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

test('PostgreSQL Full Build activation enforces AOR and Superintendent readiness',
  { skip: !process.env.DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    try {
      const tenantId = id();
      const companyId = id();
      const adminId = id();
      const managerId = id();
      const superintendentId = id();
      await client.query('INSERT INTO tenants (id, name) VALUES ($1, $2)',
        [tenantId, 'Activation tenant']);
      await client.query(
        "INSERT INTO companies (id, tenant_id, name, type) VALUES ($1,$2,'GC','GC')",
        [companyId, tenantId],
      );
      for (const [userId, email] of [
        [adminId, 'admin@example.com'], [managerId, 'manager@example.com'],
        [superintendentId, 'super@example.com'],
      ]) {
        await client.query(
          `INSERT INTO users (id, tenant_id, company_id, email, password_hash, name)
           VALUES ($1,$2,$3,$4,'fixture','User')`,
          [userId, tenantId, companyId, email],
        );
      }
      await client.query(
        "INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1,$2,'TENANT_ADMIN')",
        [tenantId, adminId],
      );
      const repo = new TenancyRepository();
      const project = await createProject(repo, client, {
        tenantId, name: 'Full Build', crewBuild: 'FULL', actorRole: 'TENANT_ADMIN',
      });
      const activation = {
        tenantId, projectId: project.id, actorId: adminId,
        actorRole: 'TENANT_ADMIN' as const, acknowledgeWarnings: true,
      };
      await assert.rejects(activateProject(repo, client, activation));
      const level = await createAorLevel(repo, client, {
        tenantId, projectId: project.id, actorId: adminId,
        actorRole: 'TENANT_ADMIN', depth: 0, label: 'UNIT',
      });
      const node = await createAorNode(repo, client, {
        tenantId, projectId: project.id, actorId: adminId,
        actorRole: 'TENANT_ADMIN', levelId: level.id, parentId: null,
        name: 'Unit One', code: 'U1',
      });
      await client.query(
        `INSERT INTO project_memberships (project_id, user_id, role) VALUES
         ($1,$2,'SURVEY_MANAGER'), ($1,$3,'SURVEY_SUPERINTENDENT')`,
        [project.id, managerId, superintendentId],
      );
      await assert.rejects(activateProject(repo, client, activation));
      await assignAorSuperintendent(repo, client, {
        tenantId, projectId: project.id, actorId: adminId,
        actorRole: 'TENANT_ADMIN', nodeId: node.id, userId: superintendentId,
      });
      const readiness = await activateProject(repo, client, activation);
      assert.equal(readiness.hardFailures.length, 0);
      const { rows } = await client.query<{ status: string }>(
        'SELECT status FROM projects WHERE id=$1', [project.id],
      );
      assert.equal(rows[0]?.status, 'ACTIVE');
      const { rows: events } = await client.query<{ event_type: string }>(
        "SELECT event_type FROM tenant_events WHERE tenant_id=$1 AND event_type='project.activated'",
        [tenantId],
      );
      assert.equal(events.length, 1);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

test('PostgreSQL field and survey cancellation chains keep state and audit atomic',
  { skip: !process.env.DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    try {
      const tenantId = id(), projectId = id(), companyId = id(), levelId = id(), nodeId = id(), departmentId = id();
      const requesterId = id(), chiefId = id(), instrumentId = id(), superintendentId = id(), managerId = id();
      await client.query('INSERT INTO tenants (id,name) VALUES ($1,$2)', [tenantId, 'Workflow tenant']);
      await client.query("INSERT INTO companies (id,tenant_id,name,type) VALUES ($1,$2,'GC','GC')",
        [companyId, tenantId]);
      for (const [userId, email] of [[requesterId, 'requester'], [chiefId, 'chief'],
        [instrumentId, 'instrument'], [superintendentId, 'super'], [managerId, 'manager']]) {
        await client.query(`INSERT INTO users (id,tenant_id,company_id,email,password_hash,name)
          VALUES ($1,$2,$3,$4,'fixture','User')`, [userId, tenantId, companyId, `${email}@example.test`]);
      }
      await client.query("INSERT INTO projects (id,tenant_id,name,status,crew_build) VALUES ($1,$2,'Project','ACTIVE','FULL')",
        [projectId, tenantId]);
      await client.query("INSERT INTO aor_levels (id,project_id,tenant_id,depth,label) VALUES ($1,$2,$3,0,'Unit')",
        [levelId, projectId, tenantId]);
      await client.query("INSERT INTO aor_nodes (id,project_id,tenant_id,level_id,name,code) VALUES ($1,$2,$3,$4,'Unit','U1')",
        [nodeId, projectId, tenantId, levelId]);
      await client.query(`INSERT INTO departments
        (id,project_id,tenant_id,name,manager_title,created_by)
        VALUES ($1,$2,$3,'Civil','Civil Manager',$4)`,
        [departmentId, projectId, tenantId, requesterId]);
      for (const [userId, role] of [[requesterId, 'REQUESTER'], [chiefId, 'PARTY_CHIEF'],
        [instrumentId, 'INSTRUMENT_MAN'], [superintendentId, 'SURVEY_SUPERINTENDENT'],
        [managerId, 'SURVEY_MANAGER']]) {
        await client.query('INSERT INTO project_memberships (project_id,user_id,role) VALUES ($1,$2,$3)',
          [projectId, userId, role]);
      }
      const repo = new TicketRepository();
      const create = () => createTicket(repo, client, { tenantId, projectId, aorNodeId: nodeId,
        departmentId,
        companyId, requesterId, requesterEmail: 'requester@example.test', ticketType: 'LAYOUT',
        workflowVariant: 'DIRECT_ASSIGNMENT', craft: 'Pipe', description: 'Work',
        requestedDate: new Date('2026-10-01') });
      const field = await create();
      await client.query(`UPDATE tickets SET status='IN_PROGRESS', assigned_party_chief_id=$2,
        assigned_instrument_man_id=$3, survey_superintendent_id=$4, survey_manager_id=$5 WHERE id=$1`,
        [field.id, chiefId, instrumentId, superintendentId, managerId]);
      await submitFieldStatus(repo, client, { tenantId, ticketId: field.id, actorId: instrumentId,
        actorRole: 'INSTRUMENT_MAN', requestedStatus: 'FIELD_CANCELED', reason: 'Unsafe access' });
      await assert.rejects(resolveFieldStatus(repo, client, { tenantId, ticketId: field.id,
        actorId: requesterId, actorRole: 'REQUESTER', approve: true }));
      const canceled = await resolveFieldStatus(repo, client, { tenantId, ticketId: field.id,
        actorId: superintendentId, actorRole: 'SURVEY_SUPERINTENDENT', approve: true });
      assert.equal(canceled.status, 'FIELD_CANCELED');
      await assert.rejects(resolveFieldStatus(repo, client, { tenantId, ticketId: field.id,
        actorId: chiefId, actorRole: 'PARTY_CHIEF', approve: true }));

      const survey = await create();
      await client.query(`UPDATE tickets SET status='IN_PROGRESS', assigned_party_chief_id=$2,
        survey_superintendent_id=$3, survey_manager_id=$4 WHERE id=$1`,
        [survey.id, chiefId, superintendentId, managerId]);
      await initiateSurveyCancel(repo, client, { tenantId, ticketId: survey.id,
        actorId: chiefId, actorRole: 'PARTY_CHIEF', reason: 'Design revision' });
      await assert.rejects(initiateSurveyCancel(repo, client, { tenantId, ticketId: survey.id,
        actorId: chiefId, actorRole: 'PARTY_CHIEF', reason: 'Duplicate' }));
      const surveyCanceled = await approveSurveyCancel(repo, client, { tenantId,
        ticketId: survey.id, actorId: superintendentId, actorRole: 'SURVEY_SUPERINTENDENT' });
      assert.equal(surveyCanceled.status, 'SURVEY_CANCELED');
      const { rows } = await client.query<{ status: string; cancel_approved_by: string }>(
        'SELECT status,cancel_approved_by FROM tickets WHERE id=$1', [survey.id]);
      assert.equal(rows[0]?.status, 'SURVEY_CANCELED');
      assert.equal(rows[0]?.cancel_approved_by, superintendentId);
      const { rows: events } = await client.query<{ event_type: string }>(
        'SELECT event_type FROM ticket_events WHERE ticket_id=$1', [survey.id]);
      assert.ok(events.some(event => event.event_type === 'ticket.survey_cancel_requested'));
      assert.ok(events.some(event => event.event_type === 'ticket.survey_canceled'));
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
