import { getHelpPickupOptions } from '@/modules/ticket/application/help-pickup-options';
import { HelpPickupRepository } from '@/modules/ticket/infrastructure/help-pickup.repository';
import { AssignmentCandidatesRepository } from '@/modules/tenancy/infrastructure/assignment-candidates.repository';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { HelpFlagRepositoryPort, HelpFlag } from '@/modules/ticket/application/help-flags';
import {
  raiseHelpFlag, escalateHelpFlag, clearHelpFlag,
  claimFlaggedTicket, clearResolvedFlagsForTicket,
  listHelpFlags,
} from '@/modules/ticket/application/help-flags';
import { HelpFlagRepository } from '@/modules/ticket/infrastructure/help-flag.repository';

const id = () => randomUUID() as UUID;
const tenantId = id(); const projectId = id(); const actorId = id();
const ticketId = id(); const flagId = id();
const l1: HelpFlag = { id: flagId, tenantId, projectId,
  raisedBy: actorId, level: 1, status: 'ACTIVE', reason: null,
  escalatedFrom: null, affectedTicketIds: [ticketId] };

function dbWithEvents(writes: string[]): DbClient {
  return { async query(query: string) {
    if (query.includes('INSERT INTO ticket_events')) writes.push('event');
    return { rows: [] };
  } };
}

test('Level 1 raise requires assigned Instrument Man and snapshots active workload', async () => {
  const writes: string[] = [];
  const repo = {
    activeProject: async () => true,
    crewChief: async () => id(),
    activeFlagForActor: async () => null,
    snapshot: async () => [ticketId],
    saveFlag: async (_db: DbClient, flag: HelpFlag) => {
      assert.deepEqual(flag.affectedTicketIds, [ticketId]); writes.push('save');
    },
  } as unknown as HelpFlagRepositoryPort;
  await assert.rejects(raiseHelpFlag(repo, dbWithEvents(writes),
    { tenantId, projectId, actorId, actorRole: 'REQUESTER', level: 1 }), ForbiddenError);
  const flag = await raiseHelpFlag(repo, dbWithEvents(writes),
    { tenantId, projectId, actorId, actorRole: 'INSTRUMENT_MAN', level: 1 });
  assert.equal(flag.level, 1);
  assert.deepEqual(writes, ['save', 'event']);
});

test('raise rejects empty workload and inactive project', async () => {
  const repo = {
    activeProject: async () => true,
    crewChief: async () => id(),
    activeFlagForActor: async () => null,
    snapshot: async () => [],
  } as unknown as HelpFlagRepositoryPort;
  await assert.rejects(raiseHelpFlag(repo, dbWithEvents([]),
    { tenantId, projectId, actorId, actorRole: 'INSTRUMENT_MAN', level: 1 }), ConflictError);
  repo.activeProject = async () => false;
  await assert.rejects(raiseHelpFlag(repo, dbWithEvents([]),
    { tenantId, projectId, actorId, actorRole: 'INSTRUMENT_MAN', level: 1 }), ConflictError);
});

test('escalation belongs to the same crew and creates a fixed Level 2 snapshot', async () => {
  const chiefId = id(); const writes: string[] = [];
  let crewOwner: UUID | null = id();
  const repo = {
    activeProject: async () => true,
    lockFlag: async () => l1,
    crewChief: async () => crewOwner,
    findEscalation: async () => null,
    activeFlagForActor: async () => null,
    snapshot: async () => [ticketId],
    saveFlag: async (_db: DbClient, flag: HelpFlag) => {
      assert.equal(flag.escalatedFrom, flagId); writes.push('save');
    },
  } as unknown as HelpFlagRepositoryPort;
  const context = { tenantId, projectId, actorId: chiefId,
    actorRole: 'PARTY_CHIEF' as const, flagId };
  await assert.rejects(escalateHelpFlag(repo, dbWithEvents(writes), context), ForbiddenError);
  crewOwner = chiefId;
  const escalated = await escalateHelpFlag(repo, dbWithEvents(writes), context);
  assert.equal(escalated.level, 2);
  assert.deepEqual(writes, ['save', 'event']);
});

test('only raiser clears active flag and state precedes audit', async () => {
  const writes: string[] = [];
  const repo = {
    activeProject: async () => true,
    lockFlag: async () => l1,
    clearFlag: async () => { writes.push('clear'); },
  } as unknown as HelpFlagRepositoryPort;
  await assert.rejects(clearHelpFlag(repo, dbWithEvents(writes),
    { tenantId, projectId, actorId: id(), actorRole: 'INSTRUMENT_MAN', flagId }), ForbiddenError);
  await clearHelpFlag(repo, dbWithEvents(writes),
    { tenantId, projectId, actorId, actorRole: 'INSTRUMENT_MAN', flagId });
  assert.deepEqual(writes, ['clear', 'event']);
});

test('claim restricts ticket snapshot, crew and role, then audits and auto clears', async () => {
  const claimant = id(); const newIm = id(); const writes: string[] = [];
  const l2: HelpFlag = { ...l1, level: 2, raisedBy: actorId };
  const repo = {
    activeProject: async () => true,
    lockTicket: async () => true,
    lockFlag: async () => l2,
    crewChief: async () => claimant,
    claimFlaggedTicket: async () => {
      writes.push('claim');
      return { oldPartyChiefId: actorId, oldInstrumentManId: id() };
    },
    activeFlagsForTicket: async () => [l2],
    isResolved: async () => true,
    clearFlag: async () => { writes.push('clear'); },
  } as unknown as HelpFlagRepositoryPort;
  const context = { tenantId, projectId, actorId: claimant,
    actorRole: 'PARTY_CHIEF' as const, flagId, ticketId,
    instrumentManId: newIm };
  await assert.rejects(claimFlaggedTicket(repo, dbWithEvents(writes),
    { ...context, actorRole: 'REQUESTER' }), ForbiddenError);
  await assert.rejects(claimFlaggedTicket(repo, dbWithEvents(writes),
    { ...context, ticketId: id() }), ForbiddenError);
  await claimFlaggedTicket(repo, dbWithEvents(writes), context);
  assert.deepEqual(writes, ['claim', 'event', 'event', 'clear', 'event']);
});

test('auto clear uses snapshot resolution and never clears unresolved flags', async () => {
  const writes: string[] = [];
  const repo = {
    activeFlagsForTicket: async () => [l1],
    isResolved: async () => false,
    clearFlag: async () => { writes.push('clear'); },
  } as unknown as HelpFlagRepositoryPort;
  assert.equal(await clearResolvedFlagsForTicket(repo, dbWithEvents(writes),
    tenantId, projectId, ticketId, actorId), 0);
  assert.deepEqual(writes, []);
  repo.isResolved = async () => true;
  assert.equal(await clearResolvedFlagsForTicket(repo, dbWithEvents(writes),
    tenantId, projectId, ticketId, actorId), 1);
  assert.deepEqual(writes, ['clear', 'event']);
});

test('cross-project flag lookup fails closed before a state change', async () => {
  const repo = {
    activeProject: async () => true,
    lockFlag: async () => null,
  } as unknown as HelpFlagRepositoryPort;
  await assert.rejects(clearHelpFlag(repo, dbWithEvents([]),
    { tenantId, projectId, actorId, actorRole: 'INSTRUMENT_MAN', flagId }), NotFoundError);
});

test('help flag listing and claim bind subcontractor company to affected tickets', async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db: DbClient = { async query(sql, params) {
    queries.push({ sql, params: params ?? [] });
    return { rows: [] };
  } };
  const repo = new HelpFlagRepository();
  await repo.listVisible(db, tenantId, projectId, actorId, 'PARTY_CHIEF');
  await repo.claimFlaggedTicket(db, { ...l1, level: 2 }, ticketId, actorId, id());
  assert.equal(queries.length, 2);
  assert.match(queries[0]!.sql, /raiser\.company_id=viewer\.company_id/);
  assert.match(queries[0]!.sql, /t\.company_id=viewer\.company_id/);
  assert.match(queries[0]!.sql, /CASE WHEN viewer_company\.type='SUBCONTRACTOR'/);
  assert.deepEqual(queries[0]!.params, [tenantId, projectId, actorId, 'PARTY_CHIEF']);
  assert.match(queries[1]!.sql, /t\.company_id=claimant\.company_id/);
  assert.deepEqual(queries[1]!.params.slice(0, 5),
    [ticketId, tenantId, projectId, actorId, actorId]);
});

test('PostgreSQL help flags preserve crew visibility, fixed snapshot, claim and audit',
  { skip: !process.env.DATABASE_URL }, async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    try {
      const t = id(); const p = id(); const c = id();
      const requester = id(); const pc1 = id(); const im1 = id();
      const pc2 = id(); const im2 = id();
      const level = id(); const node = id(); const ticket = id();
      await client.query("INSERT INTO tenants(id,name) VALUES($1,'Help flags')", [t]);
      await client.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC')", [c,t]);
      await client.query(
        `INSERT INTO users(id,tenant_id,company_id,email,password_hash,name) VALUES
         ($1,$6,$7,'hf-requester@example.com','fixture','Requester'),
         ($2,$6,$7,'hf-pc1@example.com','fixture','PC1'),
         ($3,$6,$7,'hf-im1@example.com','fixture','IM1'),
         ($4,$6,$7,'hf-pc2@example.com','fixture','PC2'),
         ($5,$6,$7,'hf-im2@example.com','fixture','IM2')`,
        [requester,pc1,im1,pc2,im2,t,c]);
      await client.query(
        "INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Flag project','ACTIVE','MEDIUM')",
        [p,t]);
      await client.query(
        `INSERT INTO project_memberships(project_id,user_id,role) VALUES
         ($1,$2,'REQUESTER'),($1,$3,'PARTY_CHIEF'),($1,$4,'INSTRUMENT_MAN'),
         ($1,$5,'PARTY_CHIEF'),($1,$6,'INSTRUMENT_MAN')`,
        [p,requester,pc1,im1,pc2,im2]);
      await client.query(
        `INSERT INTO crew_rosters(project_id,tenant_id,party_chief_id,instrument_man_id)
         VALUES($1,$2,$3,$4),($1,$2,$5,$6)`, [p,t,pc1,im1,pc2,im2]);
      await client.query(
        "INSERT INTO aor_levels(id,project_id,tenant_id,depth,label) VALUES($1,$2,$3,0,'AREA')",
        [level,p,t]);
      await client.query(
        "INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,name,code) VALUES($1,$2,$3,$4,'Area','A1')",
        [node,p,t,level]);
      await client.query(
        `INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,
           ticket_number,requester_id,assigned_party_chief_id,
           assigned_instrument_man_id,workflow_variant,status,craft,
           description,requested_date,ticket_type)
         VALUES($1,$2,$3,$4,$5,'FSS-A1-HF01',$6,$7,$8,
           'DIRECT_ASSIGNMENT','IN_PROGRESS','Pipe','Help flag','2026-10-01','LAYOUT')`,
        [ticket,t,p,node,c,requester,pc1,im1]);
      const repo = new HelpFlagRepository();
      const first = await raiseHelpFlag(repo, client,
        { tenantId:t, projectId:p, actorId:im1,
          actorRole:'INSTRUMENT_MAN', level:1 });
      assert.deepEqual(first.affectedTicketIds,[ticket]);
      const before = await listHelpFlags(repo, client,
        { tenantId:t, projectId:p, actorId:pc2, actorRole:'PARTY_CHIEF' });
      assert.equal(before.length,0);
      const second = await escalateHelpFlag(repo, client,
        { tenantId:t, projectId:p, actorId:pc1,
          actorRole:'PARTY_CHIEF', flagId:first.id });
      const visible = await listHelpFlags(repo, client,
        { tenantId:t, projectId:p, actorId:pc2, actorRole:'PARTY_CHIEF' });
      assert.deepEqual(visible.map((f)=>f.id),[second.id]);
      assert.equal(visible[0]?.raisedByName,'PC1');
      assert.deepEqual(await repo.listVisible(client,id(),p,pc2,'PARTY_CHIEF'),[]);
      await client.query('UPDATE users SET deactivated_at=NOW() WHERE tenant_id=$1 AND id=$2',[t,pc1]);
      assert.equal((await repo.listVisible(client,t,p,pc2,'PARTY_CHIEF'))[0]?.raisedByName,'PC1');
      await client.query('UPDATE users SET deactivated_at=NULL WHERE tenant_id=$1 AND id=$2',[t,pc1]);
      assert.equal(await repo.lockFlag(client,id(),p,second.id),null);
      const pickup=new HelpPickupRepository(),crewOptions=new AssignmentCandidatesRepository();
      const pickupContext={tenantId:t,projectId:p,actorId:pc2,actorRole:'PARTY_CHIEF' as const,
        flagId:second.id,kind:'tickets' as const,search:'',limit:20,offset:0};
      assert.deepEqual(await getHelpPickupOptions(repo,pickup,crewOptions,client,pickupContext),{candidates:[{id:ticket,name:'FSS-A1-HF01'}],hasMore:false});
      assert.deepEqual((await getHelpPickupOptions(repo,pickup,crewOptions,client,{...pickupContext,kind:'crew'})).candidates,[{id:im2,name:'IM2'}]);
      assert.deepEqual((await getHelpPickupOptions(repo,pickup,crewOptions,client,{...pickupContext,search:'%'})).candidates,[]);
      await assert.rejects(getHelpPickupOptions(repo,pickup,crewOptions,client,{...pickupContext,actorId:pc1}),NotFoundError);
      assert.deepEqual(await pickup.list(client,{...second,tenantId:id()},pc2,'',20,0),[]);
      await claimFlaggedTicket(repo, client,
        { tenantId:t, projectId:p, actorId:pc2, actorRole:'PARTY_CHIEF',
          flagId:second.id, ticketId:ticket, instrumentManId:im2 });
      const { rows: assignment } = await client.query<{
        assigned_party_chief_id: UUID; assigned_instrument_man_id: UUID;
      }>(`SELECT assigned_party_chief_id,assigned_instrument_man_id
         FROM tickets WHERE id=$1 AND tenant_id=$2`,[ticket,t]);
      assert.equal(assignment[0]?.assigned_party_chief_id,pc2);
      assert.equal(assignment[0]?.assigned_instrument_man_id,im2);
      assert.deepEqual(await pickup.list(client,second,pc2,'',20,0),[]);
      await assert.rejects(getHelpPickupOptions(repo,pickup,crewOptions,client,pickupContext),NotFoundError);
      const { rows: flags } = await client.query<{ status:string }>(
        `SELECT status FROM help_flags WHERE tenant_id=$1 AND project_id=$2`,[t,p]);
      assert.deepEqual(flags.map((f)=>f.status),['CLEARED','CLEARED']);
      const { rows: events } = await client.query<{ event_type:string }>(
        `SELECT event_type FROM ticket_events WHERE tenant_id=$1`,[t]);
      for (const event of ['help_flag.raised','help_flag.escalated',
        'help_flag.ticket_claimed','help_flag.cleared','ticket.assigned']) {
        assert.ok(events.some((row)=>row.event_type===event), event);
      }
      const subOne = id(), subTwo = id();
      const subRequester = id(), subChiefOne = id(), subChiefTwo = id(), subImTwo = id();
      const subTicket = id(), subFlag = id();
      await client.query(`INSERT INTO companies(id,tenant_id,name,type) VALUES
        ($1,$3,'Sub One','SUBCONTRACTOR'),($2,$3,'Sub Two','SUBCONTRACTOR')`,
        [subOne, subTwo, t]);
      await client.query(`INSERT INTO users(id,tenant_id,company_id,email,password_hash,name) VALUES
        ($1,$5,$6,'hf-sub-requester@example.com','fixture','Requester'),
        ($2,$5,$6,'hf-sub-pc1@example.com','fixture','PC1'),
        ($3,$5,$7,'hf-sub-pc2@example.com','fixture','PC2'),
        ($4,$5,$7,'hf-sub-im2@example.com','fixture','IM2')`,
        [subRequester,subChiefOne,subChiefTwo,subImTwo,t,subOne,subTwo]);
      await client.query(`INSERT INTO project_memberships(project_id,user_id,role) VALUES
        ($1,$2,'REQUESTER'),($1,$3,'PARTY_CHIEF'),($1,$4,'PARTY_CHIEF'),
        ($1,$5,'INSTRUMENT_MAN')`,
        [p,subRequester,subChiefOne,subChiefTwo,subImTwo]);
      await client.query(`INSERT INTO crew_rosters(project_id,tenant_id,party_chief_id,instrument_man_id)
        VALUES($1,$2,$3,$4)`, [p,t,subChiefTwo,subImTwo]);
      await client.query(`INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,
        ticket_number,requester_id,assigned_party_chief_id,workflow_variant,status,
        craft,description,requested_date,ticket_type)
        VALUES($1,$2,$3,$4,$5,'FSS-A1-HF02',$6,$7,
          'DIRECT_ASSIGNMENT','IN_PROGRESS','Pipe','Sub workload','2026-10-01','LAYOUT')`,
        [subTicket,t,p,node,subOne,subRequester,subChiefOne]);
      await client.query(`INSERT INTO help_flags(id,tenant_id,project_id,raised_by,
        level,status,reason,affected_ticket_ids)
        VALUES($1,$2,$3,$4,2,'ACTIVE','Sub workload',ARRAY[$5]::uuid[])`,
        [subFlag,t,p,subChiefOne,subTicket]);
      assert.deepEqual((await repo.listVisible(client,t,p,subChiefTwo,'PARTY_CHIEF'))
        .map(flag => flag.id), []);
      assert.deepEqual((await repo.listVisible(client,t,p,subChiefOne,'PARTY_CHIEF'))
        .map(flag => flag.id), [subFlag]);
      await assert.rejects(claimFlaggedTicket(repo, client,
        { tenantId:t, projectId:p, actorId:subChiefTwo,
          actorRole:'PARTY_CHIEF', flagId:subFlag, ticketId:subTicket,
          instrumentManId:subImTwo }), ConflictError);
      const { rows: untouched } = await client.query<{ assigned_party_chief_id: UUID }>(
        `SELECT assigned_party_chief_id FROM tickets WHERE id=$1`, [subTicket]);
      assert.equal(untouched[0]?.assigned_party_chief_id, subChiefOne);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
