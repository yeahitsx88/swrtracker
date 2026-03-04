import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '@/shared/errors';
import { performTransition } from '@/modules/ticket/application/shared';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const actorId = 'actor-1' as UUID;

function makeTicket(): Ticket {
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
    assignedPartyChiefId: null,
    assignedInstrumentManId: null,
    surveyLeadId: null,
    workflowVariant: 'STANDARD_APPROVAL',
    status: 'SUBMITTED',
    craft: 'Civil',
    description: 'Test ticket',
    requestedDate: now,
    submittedAt: now,
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
  };
}

function makeRepo(overrides?: Partial<ITicketRepository>): ITicketRepository {
  return {
    findById: async () => null,
    findByIdInternal: async () => null,
    save: async () => undefined,
    saveCadWork: async () => undefined,
    findProjectStatus: async () => 'ACTIVE',
    nextSequence: async () => 1,
    findAorNodeCode: async () => 'U1',
    findDepartmentById: async (_db, _tenantId, _projectId, departmentId) => ({ id: departmentId }),
    findRequesterDepartmentMembership: async () => null,
    findDepartmentTitlePriority: async () => null,
    isEmailWhitelisted: async () => false,
    patchTicket: async () => undefined,
    list: async () => ({ data: [], total: 0, limit: 50, offset: 0 }),
    findUserCompanyInfo: async () => null,
    findUserEmail: async () => null,
    findPartyChiefForInstrumentMan: async () => null,
    findAorNodeIdsForUser: async () => [],
    ...overrides,
  };
}

test('performTransition uses visibility-scoped reads when visibility is provided', async () => {
  let findByIdCalls = 0;
  let findByIdInternalCalls = 0;
  let patchCalls = 0;

  const repo = makeRepo({
    findById: async () => {
      findByIdCalls += 1;
      return null;
    },
    findByIdInternal: async () => {
      findByIdInternalCalls += 1;
      return makeTicket();
    },
    patchTicket: async () => {
      patchCalls += 1;
    },
  });

  const db: DbClient = {
    query: async () => ({ rows: [] }),
  };

  const visibility: VisibilityScope = {
    actorId,
    actorRole: 'REQUESTER',
    companyId: 'company-1' as UUID,
  };

  await assert.rejects(
    () => performTransition(db, repo, {
      tenantId,
      ticketId,
      actorId,
      actorRole: 'SURVEY_MANAGER',
      permittedRoles: ['SURVEY_MANAGER'],
      to: 'APPROVED',
      patch: { approvedAt: new Date('2026-03-04T13:00:00Z') },
      eventType: 'ticket.approved',
      visibility,
    }),
    NotFoundError,
  );

  assert.equal(findByIdCalls, 1);
  assert.equal(findByIdInternalCalls, 0);
  assert.equal(patchCalls, 0);
});

test('performTransition falls back to internal reads when visibility is absent', async () => {
  let findByIdCalls = 0;
  let findByIdInternalCalls = 0;
  let patchCalls = 0;
  const dbCalls: Array<{ sql: string; params?: unknown[] }> = [];

  const repo = makeRepo({
    findById: async () => {
      findByIdCalls += 1;
      return null;
    },
    findByIdInternal: async () => {
      findByIdInternalCalls += 1;
      return makeTicket();
    },
    patchTicket: async () => {
      patchCalls += 1;
    },
  });

  const db: DbClient = {
    query: async (sql, params) => {
      dbCalls.push({ sql, params });
      return { rows: [] };
    },
  };

  const result = await performTransition(db, repo, {
    tenantId,
    ticketId,
    actorId,
    actorRole: 'SURVEY_MANAGER',
    permittedRoles: ['SURVEY_MANAGER'],
    to: 'APPROVED',
    patch: { approvedAt: new Date('2026-03-04T13:00:00Z') },
    eventType: 'ticket.approved',
  });

  assert.equal(findByIdCalls, 0);
  assert.equal(findByIdInternalCalls, 1);
  assert.equal(patchCalls, 1);
  assert.equal(result.status, 'APPROVED');
  assert.equal(dbCalls.length, 1);
  assert.match(dbCalls[0]?.sql ?? '', /INSERT INTO ticket_events/);
});
