import test from 'node:test';
import assert from 'node:assert/strict';
import { elevateToPrority } from '@/modules/ticket/application/elevate-priority';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const actorId = 'manager-1' as UUID;

function makeTicket(): Ticket {
  const now = new Date('2026-09-30T12:00:00Z');
  return {
    id: ticketId,
    tenantId,
    projectId: 'project-1' as UUID,
    aorNodeId: 'aor-1' as UUID,
    departmentId: 'department-1' as UUID,
    companyId: 'company-1' as UUID,
    ticketNumber: 'SWR-1',
    ticketType: 'LAYOUT',
    requesterId: 'requester-1' as UUID,
    assignedPartyChiefId: null,
    assignedInstrumentManId: null,
    surveyLeadId: null,
    workflowVariant: 'STANDARD_APPROVAL',
    status: 'IN_PROGRESS',
    craft: 'Civil',
    description: 'Priority race regression',
    requestedDate: now,
    submittedAt: now,
    approvedAt: now,
    assignedAt: now,
    startedAt: now,
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
    rowVersion: 7,
    createdAt: now,
    updatedAt: now,
  };
}

test('priority elevation uses optimistic concurrency guards', async () => {
  let expected: unknown;
  const repo = {
    findById: async () => null,
    findByIdInternal: async () => makeTicket(),
    save: async () => undefined,
    saveCadWork: async () => undefined,
    findProjectStatus: async () => 'ACTIVE',
    nextSequence: async () => 1,
    findAorNodeCode: async () => 'U1',
    findDepartmentById: async () => null,
    findRequesterDepartmentMembership: async () => null,
    findDepartmentTitlePriority: async () => null,
    isEmailWhitelisted: async () => false,
    patchTicket: async (_db: DbClient, _tenantId: UUID, _ticketId: UUID, _patch: unknown, options: unknown) => {
      expected = options;
    },
    list: async () => ({ data: [], total: 0, limit: 50, offset: 0 }),
    findUserCompanyInfo: async () => null,
    findUserEmail: async () => null,
    findPartyChiefForInstrumentMan: async () => null,
    findAorNodeIdsForUser: async () => [],
  } satisfies ITicketRepository;
  const db: DbClient = { query: async () => ({ rows: [] }) };

  const updated = await elevateToPrority(repo, db, {
    tenantId,
    ticketId,
    actorId,
    actorRole: 'SURVEY_MANAGER',
    reason: 'Urgent coordination need',
  });

  assert.deepEqual(expected, { expectedStatus: 'IN_PROGRESS', expectedRowVersion: 7 });
  assert.equal(updated.rowVersion, 8);
});
