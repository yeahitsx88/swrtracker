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
    assignedPartyChiefId: 'pc-1' as UUID,
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
  assert.equal(dbCalls.length, 2);
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
  assert.equal(dbCalls.length, 1);
});
