import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { HelpFlagRepositoryPort } from '@/modules/ticket/application/help-flags';
import { HelpFlagRepository } from '@/modules/ticket/infrastructure/help-flag.repository';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { raiseHelpFlag } from '@/modules/ticket/application/help-flags';
import { reassignCrew } from '@/modules/ticket/application/reassign-crew';

const id = () => randomUUID() as UUID;
const tenantId = id(); const projectId = id(); const ticketId = id();
const actorId = id(); const oldChief = id(); const oldIm = id();
const newChief = id(); const newIm = id();
const ticket = (status: Ticket['status']): Ticket => ({
  id: ticketId, tenantId, projectId, status,
  aorNodeId: id(),
  assignedPartyChiefId: oldChief, assignedInstrumentManId: oldIm,
} as Ticket);
const params = { tenantId, ticketId, actorId,
  actorRole: 'SURVEY_MANAGER' as const,
  assignedPartyChiefId: newChief, assignedInstrumentManId: newIm,
  reason: 'Balance workload' };

function mockDb(writes: string[]): DbClient {
  return { async query(sql: string, values?: unknown[]) {
    if (sql.includes('INSERT INTO ticket_events')) {
      writes.push(`event:${values?.[4]}`);
    }
    return { rows: [] };
  } };
}

function mocks(status: Ticket['status'], writes: string[]) {
  const repo = {
    findByIdInternal: async () => ticket(status),
    findActiveProjectCrewBuild: async () => 'MEDIUM',
    isAorNodeInSurveyRoleScope: async () => true,
    isProjectAssignee: async () => true,
    findPartyChiefForInstrumentMan: async () => newChief,
    patchTicket: async (_db: DbClient, _tenant: UUID, _ticket: UUID,
      patch: { status: string }) => { writes.push(`patch:${patch.status}`); },
  } as unknown as ITicketRepository;
  const flags = {
    activeFlagsForTicket: async () => [],
  } as unknown as HelpFlagRepositoryPort;
  return { repo, flags };
}

test('Survey Manager reassignment preserves state and writes ordered audit events', async () => {
  for (const status of ['ASSIGNED','IN_PROGRESS','PENDING_PC_APPROVAL','DELAYED'] as const) {
    const writes: string[] = []; const { repo, flags } = mocks(status,writes);
    const updated = await reassignCrew(repo, flags, mockDb(writes),params);
    assert.equal(updated.status,status);
    assert.equal(updated.assignedPartyChiefId,newChief);
    assert.deepEqual(writes,[`patch:${status}`,
      'event:ticket.unassigned','event:ticket.assigned']);
  }
});

test('reassignment rejects wrong role, terminal state, inactive project and no-op', async () => {
  const writes: string[] = []; const { repo,flags } = mocks('IN_PROGRESS',writes);
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),
    { ...params,actorRole:'PARTY_CHIEF' }), ForbiddenError);
  repo.findByIdInternal = async () => ticket('COMPLETED');
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),params), ConflictError);
  repo.findByIdInternal = async () => ticket('IN_PROGRESS');
  repo.findActiveProjectCrewBuild = async () => null;
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),params), ConflictError);
  repo.findActiveProjectCrewBuild = async () => 'MEDIUM';
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),
    { ...params,assignedPartyChiefId:oldChief,
      assignedInstrumentManId:oldIm }), ConflictError);
  assert.deepEqual(writes,[]);
});

test('replacement crew must have active project roles, including cross-roster IMs', async () => {
  const writes: string[] = []; const { repo,flags } = mocks('ASSIGNED',writes);
  repo.isProjectAssignee = async () => false;
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),params), ForbiddenError);
  repo.isProjectAssignee = async () => true;
  repo.findPartyChiefForInstrumentMan = async () => oldChief;
  assert.equal((await reassignCrew(repo,flags,mockDb(writes),params))
    .assignedInstrumentManId, newIm);
  assert.deepEqual(writes,['patch:ASSIGNED',
    'event:ticket.unassigned','event:ticket.assigned']);
});

test('Superintendent reassigns only tickets in their AOR, including pending approval', async () => {
  const writes: string[] = []; const { repo,flags } = mocks('PENDING_PC_APPROVAL',writes);
  const scoped = { ...params, actorRole: 'SURVEY_SUPERINTENDENT' as const };
  repo.isAorNodeInSurveyRoleScope = async () => false;
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),scoped), ForbiddenError);
  assert.deepEqual(writes,[]);
  repo.isAorNodeInSurveyRoleScope = async (_db, _tenant, _project, _user,
    _node, role) => role === 'SURVEY_SUPERINTENDENT';
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),scoped), ForbiddenError);
  assert.deepEqual(writes,[]);
  repo.isAorNodeInSurveyRoleScope = async () => true;
  const updated = await reassignCrew(repo,flags,mockDb(writes),scoped);
  assert.equal(updated.status,'PENDING_PC_APPROVAL');
  assert.deepEqual(writes,['patch:PENDING_PC_APPROVAL',
    'event:ticket.unassigned','event:ticket.assigned']);
});

test('Party Chief may swap an active project IM only on own ticket', async () => {
  for (const status of ['ASSIGNED','IN_PROGRESS','PENDING_PC_APPROVAL','DELAYED'] as const) {
    const writes: string[] = []; const { repo,flags } = mocks(status,writes);
    const own = { ...params, actorId: oldChief, actorRole: 'PARTY_CHIEF' as const,
      assignedPartyChiefId: oldChief };
    const updated = await reassignCrew(repo,flags,mockDb(writes),own);
    assert.equal(updated.assignedInstrumentManId,newIm);
    assert.equal(updated.status,status);
    assert.deepEqual(writes,[`patch:${status}`,'event:ticket.im_reassigned']);
  }
  const writes: string[] = []; const { repo,flags } = mocks('ASSIGNED',writes);
  const own = { ...params, actorId: oldChief, actorRole: 'PARTY_CHIEF' as const,
    assignedPartyChiefId: oldChief };
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),
    { ...own,actorId:newChief }), ForbiddenError);
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),
    { ...own,assignedPartyChiefId:newChief }), ForbiddenError);
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),
    { ...own,assignedInstrumentManId:null }), ForbiddenError);
  repo.isProjectAssignee = async () => false;
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),own), ForbiddenError);
  assert.deepEqual(writes,[]);
});

test('Slim Build requires IM with no Party Chief', async () => {
  const writes: string[] = []; const { repo,flags } = mocks('IN_PROGRESS',writes);
  repo.findActiveProjectCrewBuild = async () => 'SLIM';
  await assert.rejects(reassignCrew(repo,flags,mockDb(writes),params));
  const updated = await reassignCrew(repo,flags,mockDb(writes),
    { ...params,assignedPartyChiefId:null });
  assert.equal(updated.assignedPartyChiefId,null);
});

test('PostgreSQL reassignment clears resolved flags in the assignment transaction',
  { skip: !process.env.DATABASE_URL }, async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect(); await db.query('BEGIN');
    try {
      const t=id(), p=id(), c=id(), req=id(), sm=id();
      const pc1=id(), im1=id(), pc2=id(), im2=id();
      const lv=id(), node=id(), outside=id(), tk=id(), sup=id();
      await db.query("INSERT INTO tenants(id,name) VALUES($1,'Reassign')",[t]);
      await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC')",[c,t]);
      await db.query(`INSERT INTO users(id,tenant_id,company_id,email,password_hash,name) VALUES
        ($1,$7,$8,'ra-requester@example.com','fixture','Requester'),
        ($2,$7,$8,'ra-sm@example.com','fixture','Manager'),
        ($3,$7,$8,'ra-pc1@example.com','fixture','PC1'),
        ($4,$7,$8,'ra-im1@example.com','fixture','IM1'),
        ($5,$7,$8,'ra-pc2@example.com','fixture','PC2'),
        ($6,$7,$8,'ra-im2@example.com','fixture','IM2')`,
      [req,sm,pc1,im1,pc2,im2,t,c]);
      await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Project','ACTIVE','MEDIUM')",[p,t]);
      await db.query(`INSERT INTO users(id,tenant_id,company_id,email,password_hash,name)
        VALUES($1,$2,$3,'ra-superintendent@example.com','fixture','Superintendent')`,
      [sup,t,c]);
      await db.query(`INSERT INTO project_memberships(project_id,user_id,role) VALUES
        ($1,$2,'REQUESTER'),($1,$3,'SURVEY_MANAGER'),
        ($1,$4,'PARTY_CHIEF'),($1,$5,'INSTRUMENT_MAN'),
        ($1,$6,'PARTY_CHIEF'),($1,$7,'INSTRUMENT_MAN'),
        ($1,$8,'SURVEY_SUPERINTENDENT')`,
      [p,req,sm,pc1,im1,pc2,im2,sup]);
      await db.query(`INSERT INTO crew_rosters(project_id,tenant_id,party_chief_id,instrument_man_id)
        VALUES($1,$2,$3,$4),($1,$2,$5,$6)`,[p,t,pc1,im1,pc2,im2]);
      await db.query("INSERT INTO aor_levels(id,project_id,tenant_id,depth,label) VALUES($1,$2,$3,0,'Area')",[lv,p,t]);
      await db.query("INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,name,code) VALUES($1,$2,$3,$4,'Area','A1')",[node,p,t,lv]);
      await db.query("INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,name,code) VALUES($1,$2,$3,$4,'Other','A2')",[outside,p,t,lv]);
      await db.query(`INSERT INTO aor_assignments(project_id,tenant_id,aor_node_id,user_id)
        VALUES($1,$2,$3,$4),($1,$2,$3,$5),($1,$2,$6,$7)`,
      [p,t,node,pc1,pc2,outside,sup]);
      await db.query(`INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,
        ticket_number,requester_id,assigned_party_chief_id,assigned_instrument_man_id,
        workflow_variant,status,craft,description,requested_date,ticket_type)
        VALUES($1,$2,$3,$4,$5,'FSS-A1-RA01',$6,$7,$8,
        'DIRECT_ASSIGNMENT','PENDING_PC_APPROVAL','Pipe','Reassign',
        '2026-10-01','LAYOUT')`,[tk,t,p,node,c,req,pc1,im1]);
      const ticketRepo = new TicketRepository(); const helpRepo = new HelpFlagRepository();
      const flag = await raiseHelpFlag(helpRepo,db,
        {tenantId:t,projectId:p,actorId:im1,actorRole:'INSTRUMENT_MAN',level:1});
      const updated = await reassignCrew(ticketRepo,helpRepo,db,
        {tenantId:t,ticketId:tk,actorId:sm,actorRole:'SURVEY_MANAGER',
          assignedPartyChiefId:pc2,assignedInstrumentManId:im2,reason:'Overload'});
      assert.equal(updated.status,'PENDING_PC_APPROVAL');
      assert.equal((await helpRepo.lockFlag(db,t,p,flag.id))?.status,'CLEARED');
      const imSwap = await reassignCrew(ticketRepo,helpRepo,db,
        {tenantId:t,ticketId:tk,actorId:pc2,actorRole:'PARTY_CHIEF',
          assignedPartyChiefId:pc2,assignedInstrumentManId:im1,reason:'Shift coverage'});
      assert.equal(imSwap.assignedInstrumentManId,im1);
      await assert.rejects(reassignCrew(ticketRepo,helpRepo,db,
        {tenantId:t,ticketId:tk,actorId:sup,actorRole:'SURVEY_SUPERINTENDENT',
          assignedPartyChiefId:pc1,assignedInstrumentManId:im1,
          reason:'AOR coverage'}), ForbiddenError);
      await db.query(`INSERT INTO aor_assignments(project_id,tenant_id,aor_node_id,user_id)
        VALUES($1,$2,$3,$4)`, [p,t,node,sup]);
      const scoped = await reassignCrew(ticketRepo,helpRepo,db,
        {tenantId:t,ticketId:tk,actorId:sup,actorRole:'SURVEY_SUPERINTENDENT',
          assignedPartyChiefId:pc1,assignedInstrumentManId:im1,
          reason:'AOR coverage'});
      assert.equal(scoped.assignedPartyChiefId,pc1);
      const {rows:events}=await db.query<{event_type:string}>(
        `SELECT event_type FROM ticket_events WHERE tenant_id=$1 ORDER BY created_at,id`,[t]);
      const types=events.map((e)=>e.event_type);
      assert.ok(types.includes('ticket.unassigned'));
      assert.ok(types.includes('ticket.assigned'));
      assert.ok(types.includes('ticket.im_reassigned'));
      assert.ok(types.includes('help_flag.cleared'));
    } finally { await db.query('ROLLBACK'); await db.end(); }
  });
