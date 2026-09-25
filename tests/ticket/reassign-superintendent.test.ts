import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { reassignSuperintendent } from '@/modules/ticket/application/reassign-superintendent';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';

const id = () => randomUUID() as UUID;
const tenantId = id(), projectId = id(), ticketId = id(), actorId = id(), oldId = id(), newId = id(), companyId = id();
const actor: VisibilityScope = { actorId, actorRole: 'SURVEY_MANAGER', companyId, companyType: 'GC' };
const params = { tenantId, ticketId, actor, superintendentId: newId, reason: ' Rotation ' };
const ticket = { id: ticketId, tenantId, projectId, companyId, aorNodeId: id(),
  surveySuperintendentId: oldId, status: 'PENDING_PC_APPROVAL', pendingFieldStatus: 'DELAYED',
  pendingFieldReason: 'Access blocked', pendingFieldInitiatedBy: id() } as Ticket;
function setup() {
  const writes: string[] = [];
  const db: DbClient = { async query(sql, values) {
    assert.match(sql, /INSERT INTO ticket_events/); assert.equal(values?.[4], 'ticket.superintendent_reassigned');
    writes.push('audit'); return { rows: [] };
  } };
  const repo = { findByIdInternal: async () => ticket, findActiveProjectCrewBuild: async () => 'FULL',
    isAorNodeInSurveyRoleScope: async () => true,
    patchTicket: async (_db: DbClient, tenant: UUID, key: UUID, patch: unknown) => {
      assert.equal(tenant, tenantId); assert.equal(key, ticketId);
      assert.deepEqual(patch, { status: ticket.status, surveySuperintendentId: newId }); writes.push('patch');
    } } as unknown as ITicketRepository;
  return { repo, db, writes };
}

test('manager replaces the snapshot while preserving pending report and writing audit', async () => {
  const { repo, db, writes } = setup();
  const updated = await reassignSuperintendent(repo, db, params);
  assert.equal(updated.surveySuperintendentId, newId);
  assert.equal(updated.status, ticket.status);
  assert.equal(updated.pendingFieldReason, ticket.pendingFieldReason);
  assert.equal(updated.pendingFieldInitiatedBy, ticket.pendingFieldInitiatedBy);
  assert.deepEqual(writes, ['patch', 'audit']);
});

test('superintendent replacement rejects wrong roles, invisible tickets, invalid states and candidates', async () => {
  const { repo, db, writes } = setup();
  for (const actorRole of ['SURVEY_SUPERINTENDENT', 'PARTY_CHIEF', 'TENANT_ADMIN', 'REQUESTER'] as const) {
    await assert.rejects(reassignSuperintendent(repo, db, { ...params, actor: { ...actor, actorRole } }), ForbiddenError);
  }
  await assert.rejects(reassignSuperintendent(repo, db, { ...params,
    actor: { ...actor, companyType: 'SUBCONTRACTOR', companyId: id() } }), NotFoundError);
  repo.findByIdInternal = async () => null;
  await assert.rejects(reassignSuperintendent(repo, db, params), NotFoundError);
  for (const status of ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED',
    'REQUESTER_CANCELED', 'SURVEY_CANCELED', 'FIELD_CANCELED'] as const) {
    repo.findByIdInternal = async () => ({ ...ticket, status });
    await assert.rejects(reassignSuperintendent(repo, db, params), ConflictError);
  }
  repo.findByIdInternal = async () => ticket;
  for (const build of ['MEDIUM', 'SLIM', null] as const) {
    repo.findActiveProjectCrewBuild = async () => build;
    await assert.rejects(reassignSuperintendent(repo, db, params), ConflictError);
  }
  repo.findActiveProjectCrewBuild = async () => 'FULL';
  for (const reason of ['', '   ', 'x'.repeat(501)]) {
    await assert.rejects(reassignSuperintendent(repo, db, { ...params, reason }), ValidationError);
  }
  await assert.rejects(reassignSuperintendent(repo, db, { ...params, superintendentId: oldId }), ConflictError);
  repo.isAorNodeInSurveyRoleScope = async () => false;
  await assert.rejects(reassignSuperintendent(repo, db, params), ForbiddenError);
  assert.deepEqual(writes, []);
});

test('PostgreSQL superintendent snapshot and audit roll back together on audit failure',
  { skip: !process.env.DATABASE_URL }, async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect(); await db.query('BEGIN');
    const level = id(), node = ticket.aorNodeId!, repo = new TicketRepository();
    try {
      await db.query("INSERT INTO tenants(id,name) VALUES($1,'Superintendent test')", [tenantId]);
      await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC')", [companyId, tenantId]);
      await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Full','ACTIVE','FULL')", [projectId, tenantId]);
      for (const user of [actorId, oldId, newId]) {
        await db.query('INSERT INTO users(id,tenant_id,company_id,email,name) VALUES($1,$2,$3,$4,$4)', [user, tenantId, companyId, user+'@example.test']);
      }
      await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_MANAGER'),($1,$3,'SURVEY_SUPERINTENDENT')", [projectId, actorId, newId]);
      await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Unit')", [level, tenantId, projectId]);
      await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Unit','U1')", [node, tenantId, projectId, level]);
      await db.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)', [tenantId, projectId, newId, node]);
      await db.query(`INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,aor_node_id,
        workflow_variant,status,survey_superintendent_id,pending_field_status,pending_field_reason,
        ticket_number,ticket_type,craft,description,requested_date)
        VALUES($1,$2,$3,$4,$5,$6,'STANDARD_APPROVAL','PENDING_PC_APPROVAL',$7,'DELAYED','Access blocked',
        'FSS-U1-SUP1','LAYOUT','Survey','Snapshot rotation',NOW()+INTERVAL '3 days')`,
      [ticketId, tenantId, projectId, companyId, actorId, node, oldId]);
      await assert.rejects(reassignSuperintendent(repo, db, { ...params, tenantId: id() }), NotFoundError);
      await db.query('SAVEPOINT before_change');
      const failingDb: DbClient = { async query(sql, values) {
        if (sql.includes('INSERT INTO ticket_events')) throw new Error('audit unavailable');
        return db.query(sql, values);
      } };
      await assert.rejects(reassignSuperintendent(repo, failingDb, params), /audit unavailable/);
      await db.query('ROLLBACK TO SAVEPOINT before_change');
      assert.equal((await repo.findByIdInternal(db, tenantId, ticketId))?.surveySuperintendentId, oldId);
      await reassignSuperintendent(repo, db, params);
      const saved = await repo.findByIdInternal(db, tenantId, ticketId);
      assert.equal(saved?.surveySuperintendentId, newId); assert.equal(saved?.pendingFieldStatus, 'DELAYED');
      const events = (await db.query('SELECT event_type,payload FROM ticket_events WHERE tenant_id=$1 AND ticket_id=$2', [tenantId, ticketId])).rows;
      assert.equal(events.length, 1); assert.equal(events[0].event_type, 'ticket.superintendent_reassigned');
      assert.deepEqual(events[0].payload, { oldSuperintendentId: oldId, newSuperintendentId: newId, reason: 'Rotation', status: 'PENDING_PC_APPROVAL' });
      await db.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1', [newId]);
      await db.query('UPDATE tickets SET survey_superintendent_id=$1 WHERE id=$2', [oldId, ticketId]);
      await assert.rejects(reassignSuperintendent(repo, db, params), ForbiddenError);
    } finally { await db.query('ROLLBACK'); await db.end(); }
  });
