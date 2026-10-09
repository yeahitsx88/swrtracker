import test from 'node:test';
import assert from 'node:assert/strict';
import { approvePcStatus } from '@/modules/ticket/application/approve-pc-status';
import { rejectPcStatus } from '@/modules/ticket/application/reject-pc-status';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const actorId = 'actor-1' as UUID;

function makePendingTicket(outcome: Ticket['pendingPcOutcome'] = 'COMPLETED'): Ticket {
  const now = new Date('2026-03-04T12:00:00Z');

  return {
    id: ticketId,
    tenantId,
    projectId: 'project-1' as UUID,
    aorNodeId: 'aor-node-1' as UUID,
    departmentId: null,
    companyId: 'company-1' as UUID,
    ticketNumber: 'FSS-U1-00001',
    ticketType: 'LAYOUT',
    requesterId: 'requester-1' as UUID,
    assignedPartyChiefId: actorId,
    assignedInstrumentManId: 'im-1' as UUID,
    surveyLeadId: 'lead-1' as UUID,
    workflowVariant: 'STANDARD_APPROVAL',
    status: 'PENDING_PC_APPROVAL',
    craft: 'Civil',
    description: 'Pending approval ticket',
    requestedDate: now,
    submittedAt: now,
    approvedAt: now,
    assignedAt: now,
    startedAt: now,
    pendingPcOutcome: outcome,
    pendingPcReason: 'Waiting on confirmation',
    surveyCancelRequestedBy: null,
    surveyCancelRequestedRole: null,
    surveyCancelReason: null,
    surveyCancelRequestedAt: null,
    completedAt: null,
    closedAt: null,
    rejectionReason: null,
    parentTicketId: null,
    priority: 'NORMAL',
    prioritySetBy: null,
    prioritySetReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeRepo(ticket: Ticket, patchCalls: Array<Record<string, unknown>>): ITicketRepository {
  return {
    findById: async () => ticket,
    findByIdInternal: async () => ticket,
    save: async () => undefined,
    saveCadWork: async () => undefined,
    findProjectStatus: async () => 'ACTIVE',
    nextSequence: async () => 1,
    findAorNodeCode: async () => 'U1',
    findDepartmentById: async (_db, _tenantId, _projectId, departmentId) => ({ id: departmentId }),
    findRequesterDepartmentMembership: async () => null,
    findDepartmentTitlePriority: async () => null,
    isEmailWhitelisted: async () => false,
    patchTicket: async (_db, _tenantId, _ticketId, patch) => {
      patchCalls.push(patch as unknown as Record<string, unknown>);
    },
    list: async () => ({ data: [], total: 0, limit: 50, offset: 0 }),
    findUserCompanyInfo: async () => null,
    findUserEmail: async () => null,
    findPartyChiefForInstrumentMan: async () => null,
    findAorNodeIdsForUser: async () => [],
  };
}

test('approvePcStatus finalizes the pending outcome and clears pending fields', async () => {
  const patchCalls: Array<Record<string, unknown>> = [];
  const repo = makeRepo(makePendingTicket('DELAYED'), patchCalls);
  const dbCalls: string[] = [];

  const db: DbClient = {
    query: async (sql) => {
      dbCalls.push(sql);
      return { rows: [] };
    },
  };

  const result = await approvePcStatus(repo, db, {
    tenantId,
    ticketId,
    actorId,
    actorRole: 'PARTY_CHIEF',
  });

  assert.equal(result.status, 'DELAYED');
  assert.equal(result.pendingPcOutcome, null);
  assert.equal(result.pendingPcReason, null);
  assert.equal(patchCalls.length, 1);
  assert.equal(patchCalls[0]?.status, 'DELAYED');
  assert.equal(patchCalls[0]?.pendingPcOutcome, null);
  assert.equal(patchCalls[0]?.pendingPcReason, null);
  assert.equal(dbCalls.filter(sql=>sql.includes('INSERT INTO ticket_events')).length, 2);
  assert.equal(dbCalls.filter(sql=>sql.includes('INSERT INTO notification_outbox')).length, 1);
});

test('rejectPcStatus returns the ticket to IN_PROGRESS and clears pending fields', async () => {
  const patchCalls: Array<Record<string, unknown>> = [];
  const repo = makeRepo(makePendingTicket('FIELD_CANCELED'), patchCalls);
  const dbCalls: string[] = [];

  const db: DbClient = {
    query: async (sql) => {
      dbCalls.push(sql);
      return { rows: [] };
    },
  };

  const result = await rejectPcStatus(repo, db, {
    tenantId,
    ticketId,
    actorId,
    actorRole: 'PARTY_CHIEF',
    reason: 'Still working',
  });

  assert.equal(result.status, 'IN_PROGRESS');
  assert.equal(result.pendingPcOutcome, null);
  assert.equal(result.pendingPcReason, null);
  assert.equal(patchCalls.length, 1);
  assert.equal(patchCalls[0]?.status, 'IN_PROGRESS');
  assert.equal(patchCalls[0]?.pendingPcOutcome, null);
  assert.equal(patchCalls[0]?.pendingPcReason, null);
  assert.equal(dbCalls.filter(sql=>sql.includes('INSERT INTO ticket_events')).length, 1);
  assert.equal(dbCalls.filter(sql=>sql.includes('INSERT INTO survey_notifications')).length, 1);
});

for(const outcome of ['COMPLETED','DELAYED','FIELD_CANCELED'] as const)test(`legacy ${outcome} approval sends requester outcome and current Chief override notices`,async()=>{
 const ticket=makePendingTicket(outcome),patches:Array<Record<string,unknown>>=[],calls:Array<{sql:string;values:unknown[]}>=[];ticket.rowVersion=7;
 const db:DbClient={query:async(sql,values)=>{calls.push({sql,values:values??[]});return {rows:[]};}};
 await approvePcStatus(makeRepo(ticket,patches),db,{tenantId,ticketId,actorId:'manager' as UUID,actorRole:'SURVEY_MANAGER'});
 const requester=calls.find(c=>c.sql.includes('INSERT INTO notification_outbox')&&!c.sql.includes('survey_notifications'))!;assert.equal(requester.values[2],ticket.requesterId);assert.equal(requester.values[3],outcome);assert.deepEqual(JSON.parse(requester.values[4] as string),{finalStatus:outcome,requestedStatus:outcome,reason:ticket.pendingPcReason,actorRole:'SURVEY_MANAGER'});assert.equal(requester.values[5],`${ticketId}:legacy-review:7:requester`);
 const field=calls.find(c=>c.sql.includes('INSERT INTO survey_notifications'))!;assert.equal(field.values[3],ticket.assignedPartyChiefId);assert.equal(field.values[4],'PARTY_CHIEF');assert.equal(field.values[9],'ticket.pc_approval_overridden');assert.equal(field.values[6],`${ticketId}:legacy-review:7:party-chief`);
});
test('legacy rejection notifies assigned IM and leadership override Chief without requester outcome',async()=>{
 const ticket=makePendingTicket('COMPLETED'),calls:Array<{sql:string;values:unknown[]}>=[],db:DbClient={query:async(sql,values)=>{calls.push({sql,values:values??[]});return {rows:[]};}};
 await rejectPcStatus(makeRepo(ticket,[]),db,{tenantId,ticketId,actorId:'superintendent' as UUID,actorRole:'SURVEY_SUPERINTENDENT',reason:'Continue existing work'});
 const field=calls.filter(c=>c.sql.includes('INSERT INTO survey_notifications'));assert.equal(field.length,2);assert.deepEqual(field.map(c=>[c.values[3],c.values[4],c.values[9]]),[[ticket.assignedInstrumentManId,'INSTRUMENT_MAN','ticket.pc_approval_rejected'],[ticket.assignedPartyChiefId,'PARTY_CHIEF','ticket.pc_approval_overridden']]);assert(!calls.some(c=>c.sql.includes('INSERT INTO notification_outbox')&&!c.sql.includes('survey_notifications')));
});
test('legacy notification failures propagate to the caller-owned transaction',async()=>{
 const db:DbClient={query:async sql=>{if(sql.includes('notification_outbox'))throw new Error('owned notification fault');return {rows:[]};}};
 await assert.rejects(approvePcStatus(makeRepo(makePendingTicket(),[]),db,{tenantId,ticketId,actorId,actorRole:'PARTY_CHIEF'}),/owned notification fault/);
 await assert.rejects(rejectPcStatus(makeRepo(makePendingTicket(),[]),db,{tenantId,ticketId,actorId,actorRole:'PARTY_CHIEF'}),/owned notification fault/);
});
