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
    fieldContact: 'Foreman A',
    fieldChannel: 'CH-11',
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

  assert.match(capturedSql, /\$39\b/);
  assert.equal(capturedParams.length, 39);
});


test('TicketRepository.save persists an explicit original Need-By independently of the current date', async () => {
  const current = new Date('2026-10-20T00:00:00.000Z');
  const original = new Date('2026-10-15T00:00:00.000Z');
  const captured: Array<{sql: string; params: unknown[]}> = [];
  const db: DbClient = {query: async (sql, params) => {
    captured.push({sql, params: params ?? []});
    return {rows: []};
  }};
  const repo = new TicketRepository();
  await repo.save(db, {...makeTicket(), requestedDate: current, originalRequestedDate: original});
  await repo.save(db, {...makeTicket(), requestedDate: current});
  for (const [index, snapshot] of ['2026-10-15', null].entries()) {
    const call = captured[index]!;
    const columns = call.sql.split('(')[1]!.split(')')[0]!.split(',').map(value => value.trim());
    assert.ok(columns.includes('original_requested_date'));
    assert.equal(call.params[columns.indexOf('original_requested_date')], snapshot);
    assert.equal(call.params[columns.indexOf('requested_date')], '2026-10-20');
  }
});
