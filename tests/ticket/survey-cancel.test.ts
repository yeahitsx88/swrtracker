import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError } from '@/shared/errors';
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
    assignedPartyChiefId: 'pc-1' as UUID,
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
  assert.equal(dbCalls.length, 2);
});
