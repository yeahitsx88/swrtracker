import { requesterCancel } from '@/modules/ticket/application/requester-cancel';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import { requestSurveyCancel } from '@/modules/ticket/application/request-survey-cancel';
import { approveSurveyCancel } from '@/modules/ticket/application/approve-survey-cancel';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const actorId = 'actor-1' as UUID;

function makeTicket(overrides?: Partial<Ticket>): Ticket {
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
    status: 'APPROVED',
    craft: 'Civil',
    description: 'Survey cancel test ticket',
    requestedDate: now,
    submittedAt: now,
    approvedAt: now,
    assignedAt: null,
    startedAt: null,
    pendingPcOutcome: null,
    pendingPcReason: null,
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
    ...overrides,
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

test('requestSurveyCancel stores a pending request for Party Chief initiators', async () => {
  const patchCalls: Array<Record<string, unknown>> = [];
  const repo = makeRepo(makeTicket({ status: 'ASSIGNED' }), patchCalls);
  const dbCalls: string[] = [];
  const db: DbClient = {
    query: async (sql) => {
      dbCalls.push(sql);
      return { rows: [] };
    },
  };

  const result = await requestSurveyCancel(repo, db, {
    tenantId,
    ticketId,
    actorId,
    actorRole: 'PARTY_CHIEF',
    reason: 'Scope changed',
  });

  assert.equal(result.status, 'ASSIGNED');
  assert.equal(result.surveyCancelRequestedRole, 'PARTY_CHIEF');
  assert.equal(result.surveyCancelReason, 'Scope changed');
  assert.equal(patchCalls.length, 1);
  assert.equal(patchCalls[0]?.status, 'ASSIGNED');
  assert.equal(patchCalls[0]?.surveyCancelRequestedRole, 'PARTY_CHIEF');
  assert.equal(dbCalls.length, 1);
});

test('approveSurveyCancel requires Survey Manager approval for superintendent-initiated requests', async () => {
  const patchCalls: Array<Record<string, unknown>> = [];
  const repo = makeRepo(makeTicket({
    status: 'APPROVED',
    surveyCancelRequestedBy: 'sup-1' as UUID,
    surveyCancelRequestedRole: 'SURVEY_SUPERINTENDENT',
    surveyCancelReason: 'Design revision',
    surveyCancelRequestedAt: new Date('2026-03-04T13:00:00Z'),
  }), patchCalls);

  const db: DbClient = {
    query: async () => ({ rows: [] }),
  };

  await assert.rejects(
    () => approveSurveyCancel(repo, db, {
      tenantId,
      ticketId,
      actorId,
      actorRole: 'SURVEY_SUPERINTENDENT',
    }),
    ForbiddenError,
  );

  assert.equal(patchCalls.length, 0);
});

test('approveSurveyCancel clears pending request metadata and cancels the ticket', async () => {
  const patchCalls: Array<Record<string, unknown>> = [];
  const repo = makeRepo(makeTicket({
    status: 'IN_PROGRESS',
    surveyCancelRequestedBy: 'pc-1' as UUID,
    surveyCancelRequestedRole: 'PARTY_CHIEF',
    surveyCancelReason: 'Stop-work directive',
    surveyCancelRequestedAt: new Date('2026-03-04T13:00:00Z'),
  }), patchCalls);
  const dbCalls: string[] = [];

  const db: DbClient = {
    query: async (sql) => {
      dbCalls.push(sql);
      return { rows: [] };
    },
  };

  const result = await approveSurveyCancel(repo, db, {
    tenantId,
    ticketId,
    actorId,
    actorRole: 'SURVEY_MANAGER',
  });

  assert.equal(result.status, 'SURVEY_CANCELED');
  assert.equal(patchCalls.length, 1);
  assert.equal(patchCalls[0]?.status, 'SURVEY_CANCELED');
  assert.equal(patchCalls[0]?.surveyCancelRequestedBy, null);
  assert.equal(patchCalls[0]?.surveyCancelRequestedRole, null);
  assert.equal(patchCalls[0]?.assignedPartyChiefId, null);
  assert.equal(patchCalls[0]?.assignedInstrumentManId, null);
  assert.equal(dbCalls.filter(sql=>sql.includes('UPDATE survey_rejection_proposals')).length,1);
  assert.equal(dbCalls.filter((sql) => /notification_outbox/.test(sql)).length, 3);
});

test('requester cancellation queues stop work for the captured crew before clearing assignments', async () => {
  const patchCalls:Array<Record<string,unknown>>=[];
  const original=makeTicket({status:'IN_PROGRESS'});
  const outbox:unknown[][]=[];
  const db:DbClient={query:async(sql,params)=>{
    if(sql.includes('INSERT INTO notification_outbox')) outbox.push(params??[]);
    return {rows:[]};
  }};
  const result=await requesterCancel(makeRepo(original,patchCalls),db,{
    tenantId,ticketId,actorId:original.requesterId,actorRole:'REQUESTER',
  });
  assert.equal(result.assignedPartyChiefId,null);
  assert.equal(result.assignedInstrumentManId,null);
  assert.deepEqual(outbox.filter(p=>p[3]==='STOP_WORK_CANCELED').map(p=>p[2]),[actorId,'im-1']);
  assert.equal(outbox.filter(p=>p[3]==='REQUESTER_CANCELED').length,1);
  assert.equal(new Set(outbox.map(p=>p[5])).size,3);
});


test('assigned field staff cannot create stop-work flags on closed requests in either variant', async () => {
  for (const workflowVariant of ['STANDARD_APPROVAL', 'DIRECT_ASSIGNMENT'] as const) {
    for (const status of ['COMPLETED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED'] as const) {
      for (const actorRole of ['PARTY_CHIEF', 'INSTRUMENT_MAN'] as const) {
        const patches: Array<Record<string, unknown>> = [];
        const queries: string[] = [];
        const original = makeTicket({workflowVariant, status, assignedInstrumentManId: actorId});
        const db: DbClient = {query: async sql => {queries.push(sql); return {rows: []};}};
        await assert.rejects(() => requestSurveyCancel(makeRepo(original, patches), db, {
          tenantId, ticketId, actorId, actorRole, reason: 'Work was already closed',
        }), ConflictError);
        assert.equal(patches.length, 0, `${workflowVariant}/${status}/${actorRole} preserves the record`);
        assert.equal(queries.length, 0, 'No audit, notice or persistence effect on refusal');
        assert.equal(original.surveyCancelRequestedAt, null);
      }
    }
  }
});

test('assigned Chief and Instrument Man can still flag active stop-work without cancelling the request', async () => {
  for (const workflowVariant of ['STANDARD_APPROVAL', 'DIRECT_ASSIGNMENT'] as const) {
    for (const actorRole of ['PARTY_CHIEF', 'INSTRUMENT_MAN'] as const) {
      for (const status of ['ASSIGNED', 'IN_PROGRESS', 'DELAYED', 'PENDING_FIELD_VALIDATION'] as const) {
        const patches: Array<Record<string, unknown>> = [];
        const queries: string[] = [];
        const original = makeTicket({workflowVariant, status, assignedInstrumentManId: actorId});
        const db: DbClient = {query: async sql => {queries.push(sql); return {rows: []};}};
        const result = await requestSurveyCancel(makeRepo(original, patches), db, {
          tenantId, ticketId, actorId, actorRole, reason: 'Current work must stop',
        });
        assert.equal(result.status, status);
        assert.equal(result.surveyCancelRequestedRole, actorRole);
        assert.equal(patches.length, 1);
        assert.equal(queries.filter(sql => sql.includes('INSERT INTO ticket_events')).length, 1);
      }
    }
  }
});

test('terminal stop-work refusals retain wrong-role and personal-assignment checks', async () => {
  for (const actorRole of ['PARTY_CHIEF', 'INSTRUMENT_MAN', 'REQUESTER', 'VIEWER', 'SURVEY_SUPERINTENDENT'] as const) {
    const patches: Array<Record<string, unknown>> = [];
    const queries: string[] = [];
    const original = makeTicket({status: 'COMPLETED', assignedPartyChiefId: 'another-chief' as UUID});
    const db: DbClient = {query: async sql => {queries.push(sql); return {rows: []};}};
    await assert.rejects(() => requestSurveyCancel(makeRepo(original, patches), db, {
      tenantId, ticketId, actorId, actorRole, reason: 'Unauthorized terminal action',
    }), ForbiddenError);
    assert.equal(patches.length, 0);
    assert.equal(queries.length, 0);
  }
});
