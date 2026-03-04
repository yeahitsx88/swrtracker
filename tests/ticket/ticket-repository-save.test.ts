import test from 'node:test';
import assert from 'node:assert/strict';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

function makeTicket(): Ticket {
  const now = new Date('2026-03-04T12:00:00Z');

  return {
    id: 'ticket-1' as UUID,
    tenantId: 'tenant-1' as UUID,
    projectId: 'project-1' as UUID,
    aorNodeId: 'aor-node-1' as UUID,
    departmentId: null,
    companyId: 'company-1' as UUID,
    ticketNumber: null,
    ticketType: 'LAYOUT',
    requesterId: 'requester-1' as UUID,
    assignedPartyChiefId: null,
    assignedInstrumentManId: null,
    surveyLeadId: null,
    workflowVariant: 'STANDARD_APPROVAL',
    status: 'DRAFT',
    craft: 'Civil',
    description: 'Repository save test',
    requestedDate: new Date('2026-03-08T12:00:00Z'),
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
  };
}

test('TicketRepository.save includes a placeholder for every ticket column value', async () => {
  let capturedSql = '';
  let capturedParams: unknown[] = [];

  const db: DbClient = {
    query: async (sql, params) => {
      capturedSql = sql;
      capturedParams = params ?? [];
      return { rows: [] };
    },
  };

  const repo = new TicketRepository();
  await repo.save(db, makeTicket());

  assert.match(capturedSql, /\$36\b/);
  assert.equal(capturedParams.length, 36);
});
