import test from 'node:test';
import assert from 'node:assert/strict';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { Ticket, TicketPriority } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const requesterId = 'requester-1' as UUID;
const ticketDepartmentId = 'department-ticket' as UUID;
const memberDepartmentId = 'department-member' as UUID;
const seventyTwoHoursFromNow = () => new Date(Date.now() + (72 * 60 * 60 * 1000));

function makeDraftTicket(overrides?: Partial<Ticket>): Ticket {
  const now = new Date('2026-03-04T12:00:00Z');

  return {
    id: ticketId,
    tenantId,
    projectId,
    aorNodeId: 'aor-node-1' as UUID,
    departmentId: ticketDepartmentId,
    companyId: 'company-1' as UUID,
    ticketNumber: null,
    ticketType: 'LAYOUT',
    requesterId,
    assignedPartyChiefId: null,
    assignedInstrumentManId: null,
    surveyLeadId: null,
    workflowVariant: 'STANDARD_APPROVAL',
    status: 'DRAFT',
    craft: 'Civil',
    description: 'Submission priority test ticket',
    requestedDate: seventyTwoHoursFromNow(),
    submittedAt: null,
    approvedAt: null,
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

function makeRepo(overrides?: Partial<ITicketRepository>): ITicketRepository {
  return {
    findById: async () => null,
    findByIdInternal: async () => makeDraftTicket(),
    save: async () => undefined,
    saveCadWork: async () => undefined,
    findProjectStatus: async () => 'ACTIVE',
    nextSequence: async () => 12,
    findAorNodeCode: async () => 'U1',
    findDepartmentById: async (_db, _tenantId, _projectId, departmentId) => ({ id: departmentId }),
    findRequesterDepartmentMembership: async () => null,
    findDepartmentTitlePriority: async () => null,
    isEmailWhitelisted: async () => false,
    patchTicket: async () => undefined,
    list: async () => ({ data: [], total: 0, limit: 50, offset: 0 }),
    findUserCompanyInfo: async () => null,
    findUserEmail: async () => 'requester@example.com',
    findPartyChiefForInstrumentMan: async () => null,
    findAorNodeIdsForUser: async () => [],
    ...overrides,
  };
}

test('submitTicket derives department and default priority from department membership and title', async () => {
  const patchCalls: Array<Record<string, unknown>> = [];
  const dbCalls: Array<{ sql: string; params?: unknown[] }> = [];
  let departmentLookupCalls = 0;

  const repo = makeRepo({
    findByIdInternal: async () => makeDraftTicket({ departmentId: ticketDepartmentId }),
    findRequesterDepartmentMembership: async () => ({
      departmentId: memberDepartmentId,
      title: 'QA Manager',
    }),
    findDepartmentTitlePriority: async () => 'MED_HIGH',
    findDepartmentById: async () => {
      departmentLookupCalls += 1;
      return { id: ticketDepartmentId };
    },
    patchTicket: async (_db, _tenantId, _ticketId, patch) => {
      patchCalls.push(patch as unknown as Record<string, unknown>);
    },
  });
  const db: DbClient = {
    query: async (sql, params) => {
      dbCalls.push({ sql, params });
      return { rows: [] };
    },
  };

  const result = await submitTicket(repo, db, {
    tenantId,
    ticketId,
    actorId: requesterId,
    actorRole: 'REQUESTER',
  });

  assert.equal(result.departmentId, memberDepartmentId);
  assert.equal(result.priority, 'MED_HIGH');
  assert.equal(patchCalls[0]?.departmentId, memberDepartmentId);
  assert.equal(patchCalls[0]?.priority, 'MED_HIGH');
  assert.equal(departmentLookupCalls, 0);
  assert.equal(dbCalls.length, 1);
  assert.equal(dbCalls[0]?.params?.[4], 'ticket.submitted');
});

test('submitTicket accepts a manual department at submit time when the requester has no membership', async () => {
  const patchCalls: Array<Record<string, unknown>> = [];
  const repo = makeRepo({
    findByIdInternal: async () => makeDraftTicket({ departmentId: null }),
    patchTicket: async (_db, _tenantId, _ticketId, patch) => {
      patchCalls.push(patch as unknown as Record<string, unknown>);
    },
  });
  const db: DbClient = {
    query: async () => ({ rows: [] }),
  };

  const result = await submitTicket(repo, db, {
    tenantId,
    ticketId,
    actorId: requesterId,
    actorRole: 'REQUESTER',
    departmentId: ticketDepartmentId,
  });

  assert.equal(result.departmentId, ticketDepartmentId);
  assert.equal(result.priority, 'NORMAL');
  assert.equal(patchCalls[0]?.departmentId, ticketDepartmentId);
  assert.equal(patchCalls[0]?.priority, 'NORMAL');
});

test('submitTicket overrides derived priority to HIGH when the requester email is whitelisted', async () => {
  const patchCalls: Array<Record<string, unknown>> = [];
  const dbCalls: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = makeRepo({
    findRequesterDepartmentMembership: async () => ({
      departmentId: memberDepartmentId,
      title: 'Field Engineer',
    }),
    findDepartmentTitlePriority: async () => 'MEDIUM',
    isEmailWhitelisted: async () => true,
    patchTicket: async (_db, _tenantId, _ticketId, patch) => {
      patchCalls.push(patch as unknown as Record<string, unknown>);
    },
  });
  const db: DbClient = {
    query: async (sql, params) => {
      dbCalls.push({ sql, params });
      return { rows: [] };
    },
  };

  const result = await submitTicket(repo, db, {
    tenantId,
    ticketId,
    actorId: requesterId,
    actorRole: 'REQUESTER',
  });

  assert.equal(result.priority, 'HIGH');
  assert.equal(patchCalls[0]?.priority, 'HIGH');
  assert.equal(dbCalls.length, 2);
  assert.deepEqual(
    dbCalls.map((call) => call.params?.[4] as string),
    ['ticket.submitted', 'ticket.priority_set_by_whitelist'],
  );
});
