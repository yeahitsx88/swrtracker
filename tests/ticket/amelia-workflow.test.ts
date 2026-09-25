import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError } from '@/shared/errors';
import { assignTicket } from '@/modules/ticket/application/assign-ticket';
import { completeTicket } from '@/modules/ticket/application/complete-ticket';
import { reportFieldInability } from '@/modules/ticket/application/field-inability';
import { returnTicketForCorrection } from '@/modules/ticket/application/return-ticket-for-correction';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import { updateRequesterTicket } from '@/modules/ticket/application/update-requester-ticket';
import { revisePriority } from '@/modules/ticket/application/revise-priority';
import type { ITicketRepository, TicketStatusPatch } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const requesterId = 'requester-1' as UUID;
const managerId = 'manager-1' as UUID;
const pcId = 'pc-1' as UUID;
const imId = 'im-1' as UUID;

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  const now = new Date('2026-09-24T12:00:00Z');
  return {
    id: ticketId,
    tenantId,
    projectId,
    aorNodeId: 'aor-1' as UUID,
    departmentId: 'department-1' as UUID,
    companyId: 'company-1' as UUID,
    ticketNumber: 'FSS-A1-00001',
    ticketType: 'LAYOUT',
    requesterId,
    assignedPartyChiefId: null,
    assignedInstrumentManId: null,
    surveyLeadId: managerId,
    workflowVariant: 'STANDARD_APPROVAL',
    status: 'APPROVED',
    craft: 'Civil',
    description: 'Amelia beta workflow',
    requestedDate: new Date('2026-10-01T00:00:00Z'),
    originalRequestedDate: new Date('2026-10-01T00:00:00Z'),
    firstSubmittedAt: now,
    returnCycle: 0,
    fieldValidationReviewerId: null,
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
    rowVersion: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness(initial: Ticket) {
  let current = initial;
  let sequenceCalls = 0;
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const db: DbClient = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  const repo: ITicketRepository = {
    findById: async () => current,
    findByIdInternal: async () => current,
    save: async () => undefined,
    saveCadWork: async () => undefined,
    nextSequence: async () => { sequenceCalls += 1; return 99; },
    findAorNodeCode: async () => 'A1',
    findDepartmentById: async (_db, _tenant, _project, id) => ({ id }),
    findRequesterDepartmentMembership: async () => ({ departmentId: current.departmentId!, title: null }),
    findDepartmentTitlePriority: async () => null,
    isEmailWhitelisted: async () => false,
    patchTicket: async (_db, _tenant, _ticket, patch: TicketStatusPatch) => {
      current = {
        ...current,
        ...patch,
        rowVersion: (current.rowVersion ?? 0) + 1,
        updatedAt: new Date(),
      };
    },
    list: async () => ({ data: [], total: 0, limit: 50, offset: 0 }),
    findUserCompanyInfo: async () => ({ companyId: current.companyId, companyType: 'GC' }),
    findUserEmail: async () => 'requester@example.com',
    findPartyChiefForInstrumentMan: async () => current.assignedPartyChiefId,
    findAorNodeIdsForUser: async () => [current.aorNodeId],
    findProjectStatus: async () => 'ACTIVE',
    findProjectLeadTimeConfig: async () => ({ enforcementEnabled: false, leadTimeDays: 2 }),
    isActiveProjectMemberWithRole: async (_db, _tenant, _project, userId, roles) =>
      (userId === pcId && roles.includes('PARTY_CHIEF')) ||
      (userId === imId && roles.includes('INSTRUMENT_MAN')),
  };
  return { db, repo, current: () => current, queries, sequenceCalls: () => sequenceCalls };
}

test('Party Chief assignment is optional and does not leave the approved queue', async () => {
  const h = harness(ticket());
  const result = await assignTicket(h.repo, h.db, {
    tenantId,
    ticketId,
    actorId: managerId,
    actorRole: 'SURVEY_MANAGER',
    assignedPartyChiefId: pcId,
    assignedInstrumentManId: null,
    surveyLeadId: managerId,
  });
  assert.equal(result.status, 'APPROVED');
  assert.equal(result.assignedPartyChiefId, pcId);
  assert.equal(result.assignedInstrumentManId, null);
  assert.ok(h.queries.some((query) => /ticket_assignment_history/.test(query.sql)));
});

test('direct Instrument Man assignment enters ASSIGNED and direct completion is final', async () => {
  const h = harness(ticket());
  await assignTicket(h.repo, h.db, {
    tenantId,
    ticketId,
    actorId: managerId,
    actorRole: 'SURVEY_MANAGER',
    assignedPartyChiefId: null,
    assignedInstrumentManId: imId,
    surveyLeadId: managerId,
  });
  assert.equal(h.current().status, 'ASSIGNED');
  h.current().status = 'IN_PROGRESS';
  const completed = await completeTicket(h.repo, h.db, {
    tenantId,
    ticketId,
    actorId: imId,
    actorRole: 'INSTRUMENT_MAN',
  });
  assert.equal(completed.status, 'COMPLETED');
  assert.ok(completed.completedAt instanceof Date);
  await assert.rejects(() => completeTicket(h.repo, h.db, {
    tenantId,
    ticketId,
    actorId: pcId,
    actorRole: 'PARTY_CHIEF',
  }), ForbiddenError);
});

test('field inability routes to Party Chief when assigned and Survey Lead otherwise', async () => {
  const withPc = harness(ticket({
    status: 'IN_PROGRESS',
    assignedPartyChiefId: pcId,
    assignedInstrumentManId: imId,
  }));
  const pendingPc = await reportFieldInability(withPc.repo, withPc.db, {
    tenantId,
    ticketId,
    actorId: imId,
    actorRole: 'INSTRUMENT_MAN',
    reason: 'Control point inaccessible',
  });
  assert.equal(pendingPc.status, 'PENDING_FIELD_VALIDATION');
  assert.equal(pendingPc.fieldValidationReviewerId, pcId);

  const withoutPc = harness(ticket({
    status: 'IN_PROGRESS',
    assignedInstrumentManId: imId,
  }));
  const pendingLead = await reportFieldInability(withoutPc.repo, withoutPc.db, {
    tenantId,
    ticketId,
    actorId: imId,
    actorRole: 'INSTRUMENT_MAN',
    reason: 'Unsafe access',
  });
  assert.equal(pendingLead.fieldValidationReviewerId, managerId);
});

test('validated return preserves SWR number and first submission on resubmit', async () => {
  const firstSubmittedAt = new Date('2026-09-24T12:00:00Z');
  const h = harness(ticket({
    status: 'PENDING_FIELD_VALIDATION',
    assignedPartyChiefId: pcId,
    assignedInstrumentManId: imId,
    fieldValidationReviewerId: pcId,
    firstSubmittedAt,
  }));
  const returned = await returnTicketForCorrection(h.repo, h.db, {
    tenantId,
    ticketId,
    actorId: pcId,
    actorRole: 'PARTY_CHIEF',
    reason: 'Requester must provide revised control',
    origin: 'FIELD_INABILITY',
  });
  assert.equal(returned.status, 'RETURNED_FOR_CORRECTION');
  assert.equal(returned.returnCycle, 1);
  assert.equal(returned.assignedInstrumentManId, null);

  const resubmitted = await submitTicket(h.repo, h.db, {
    tenantId,
    ticketId,
    actorId: requesterId,
    actorRole: 'REQUESTER',
  });
  assert.equal(resubmitted.status, 'SUBMITTED');
  assert.equal(resubmitted.ticketNumber, 'FSS-A1-00001');
  assert.equal(resubmitted.firstSubmittedAt, firstSubmittedAt);
  assert.equal(h.sequenceCalls(), 0);
  assert.ok(h.queries.some((query) => /SET resubmitted_at/.test(query.sql)));
});

test('requester edits remain limited to own draft or returned SWR', async () => {
  const h = harness(ticket({ status: 'RETURNED_FOR_CORRECTION', returnCycle: 2 }));
  const db: DbClient = {
    query: async <T extends object>(sql: string) => {
      const rows: object[] = /SELECT EXISTS/.test(sql)
        ? [{ valid: true }]
        : /UPDATE tickets/.test(sql)
          ? [{ id: ticketId }]
          : [];
      return { rows: rows as T[] };
    },
  };
  const updated = await updateRequesterTicket(h.repo, db, {
    tenantId,
    ticketId,
    actorId: requesterId,
    actorRole: 'REQUESTER',
    changes: { description: '  Revised instructions  ', aorNodeId: 'aor-2' as UUID },
  });
  assert.equal(updated.description, 'Revised instructions');
  assert.equal(updated.aorNodeId, 'aor-2');

  await assert.rejects(() => updateRequesterTicket(h.repo, db, {
    tenantId,
    ticketId,
    actorId: 'coworker-1' as UUID,
    actorRole: 'REQUESTER',
    changes: { description: 'Unauthorized edit' },
  }), ForbiddenError);
});

test('Survey Lead can revise priority independently with an audit reason', async () => {
  const h = harness(ticket({ status: 'ASSIGNED', assignedInstrumentManId: imId }));
  const updated = await revisePriority(h.repo, h.db, {
    tenantId,
    ticketId,
    actorId: managerId,
    actorRole: 'SURVEY_MANAGER',
    priority: 'HIGH',
    reason: 'Active civil hold point',
  });
  assert.equal(updated.status, 'ASSIGNED');
  assert.equal(updated.priority, 'HIGH');
  assert.equal(updated.prioritySetReason, 'Active civil hold point');
  assert.ok(h.queries.some((query) => /ticket.priority_revised/.test(String(query.params?.[4]))));

  await assert.rejects(() => revisePriority(h.repo, h.db, {
    tenantId,
    ticketId,
    actorId: requesterId,
    actorRole: 'REQUESTER',
    priority: 'NORMAL',
    reason: 'Requester change',
  }), ForbiddenError);
});
