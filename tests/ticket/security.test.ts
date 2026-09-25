import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import { requestCancel } from '@/modules/ticket/application/request-cancel';
import { startTicket } from '@/modules/ticket/application/start-ticket';
import { completeTicket } from '@/modules/ticket/application/complete-ticket';
import { assignTicket } from '@/modules/ticket/application/assign-ticket';
import { approveTicket } from '@/modules/ticket/application/approve-ticket';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { submitFieldStatus, resolveFieldStatus, restartDelayed } from '@/modules/ticket/application/field-status';
import { initiateSurveyCancel, approveSurveyCancel } from '@/modules/ticket/application/survey-cancel';

const id = (value: string) => value as UUID;
const tenantId = id('00000000-0000-0000-0000-000000000001');
const projectId = id('00000000-0000-0000-0000-000000000002');
const requesterId = id('00000000-0000-0000-0000-000000000003');
const otherId = id('00000000-0000-0000-0000-000000000004');
const chiefId = id('00000000-0000-0000-0000-000000000005');
const instrumentId = id('00000000-0000-0000-0000-000000000006');
const ticketId = id('00000000-0000-0000-0000-000000000007');

function ticket(status: Ticket['status']): Ticket {
  return {
    id: ticketId, tenantId, projectId, requesterId, status,
    areaId: null, subareaId: null,
    aorNodeId: id('00000000-0000-0000-0000-000000000008'),
    departmentId: id('00000000-0000-0000-0000-000000000009'),
    companyId: id('00000000-0000-0000-0000-000000000010'),
    ticketNumber: 'FSS-U1-00001', ticketType: 'LAYOUT',
    assignedPartyChiefId: chiefId, assignedInstrumentManId: instrumentId,
    surveyLeadId: null, workflowVariant: 'STANDARD_APPROVAL',
    surveySuperintendentId: null, surveyManagerId: null,
    craft: 'Pipe', description: 'Layout', requestedDate: new Date('2026-10-01'),
    draftLastSavedAt: null, draftDeletedAt: null, draftDeletedReason: null,
    submittedAt: null, approvedAt: null, assignedAt: null, startedAt: null,
    completedAt: null, closedAt: null, canceledAt: null, rejectionReason: null,
    rejectedAt: null,
    pendingFieldStatus: status === 'PENDING_PC_APPROVAL' ? 'COMPLETED' : null,
    pendingFieldReason: null, pendingFieldInitiatedBy: null, delayedReason: null,
    cancelReason: null, cancelInitiatedBy: null, cancelInitiatedAt: null,
    cancelInitiatorRole: null, cancelApprovedBy: null,
    parentTicketId: null, priorityElevatedBy: null,
    priority: 'NORMAL', prioritySetBy: null, prioritySetReason: null,
    priorityElevatedReason: null, createdAt: new Date(), updatedAt: new Date(),
  };
}

function context(status: Ticket['status']) {
  const writes: string[] = [];
  const db: DbClient = {
    async query(sql) { writes.push(sql); return { rows: [] }; },
  };
  const repo = {
    findByIdInternal: async () => ticket(status),
    findActiveProjectCrewBuild: async () => 'FULL',
    patchTicket: async () => { writes.push('patch'); },
  } as unknown as ITicketRepository;
  return { db, repo, writes };
}

test('requester cancellation rejects a peer and accepts the owner atomically', async () => {
  const { db, repo, writes } = context('ASSIGNED');
  await assert.rejects(requestCancel(repo, db, {
    tenantId, ticketId, actorId: otherId, actorRole: 'REQUESTER',
  }), ForbiddenError);
  assert.deepEqual(writes, []);

  const result = await requestCancel(repo, db, {
    tenantId, ticketId, actorId: requesterId, actorRole: 'REQUESTER',
  });
  assert.equal(result.status, 'REQUESTER_CANCELED');
  assert.ok(result.canceledAt instanceof Date);
  assert.equal(writes[0], 'patch');
  assert.match(writes[1] ?? '', /INSERT INTO ticket_events/);
});

test('a ticket requester with an elevated role retains Path A cancellation', async () => {
  const { db, repo } = context('ASSIGNED');
  const result = await requestCancel(repo, db, {
    tenantId, ticketId, actorId: requesterId, actorRole: 'SURVEY_MANAGER',
  });
  assert.equal(result.status, 'REQUESTER_CANCELED');
});

test('unassigned crew cannot start or complete another crew ticket', async () => {
  const start = context('ASSIGNED');
  await assert.rejects(startTicket(start.repo, start.db, {
    tenantId, ticketId, actorId: otherId, actorRole: 'PARTY_CHIEF',
  }), ForbiddenError);
  assert.deepEqual(start.writes, []);
  assert.equal((await startTicket(start.repo, start.db, {
    tenantId, ticketId, actorId: chiefId, actorRole: 'PARTY_CHIEF',
  })).status, 'IN_PROGRESS');

  const complete = context('IN_PROGRESS');
  await assert.rejects(completeTicket(complete.repo, complete.db, {
    tenantId, ticketId, actorId: otherId, actorRole: 'INSTRUMENT_MAN',
  }), ForbiddenError);
  assert.deepEqual(complete.writes, []);
  assert.equal((await completeTicket(complete.repo, complete.db, {
    tenantId, ticketId, actorId: instrumentId, actorRole: 'INSTRUMENT_MAN',
  })).status, 'PENDING_PC_APPROVAL');
  const pending = context('PENDING_PC_APPROVAL');
  await assert.rejects(completeTicket(pending.repo, pending.db, {
    tenantId, ticketId, actorId: otherId, actorRole: 'PARTY_CHIEF',
  }), ForbiddenError);
  assert.equal((await completeTicket(pending.repo, pending.db, {
    tenantId, ticketId, actorId: chiefId, actorRole: 'PARTY_CHIEF',
  })).status, 'COMPLETED');
  assert.equal(pending.writes.filter((sql) => /INSERT INTO ticket_events/.test(sql)).length, 2);
  const bypass = context('IN_PROGRESS');
  await assert.rejects(completeTicket(bypass.repo, bypass.db, {
    tenantId, ticketId, actorId: chiefId, actorRole: 'PARTY_CHIEF',
  }));
  assert.deepEqual(bypass.writes, []);
});

test('assignment rejects crew outside the ticket project before any write', async () => {
  const writes: string[] = [];
  const db: DbClient = { async query(sql) { writes.push(sql); return { rows: [] }; } };
  const repo = {
    findByIdInternal: async () => ticket('APPROVED'),
    findActiveProjectCrewBuild: async () => 'FULL',
    isProjectAssignee: async () => false,
    patchTicket: async () => { writes.push('patch'); },
  } as unknown as ITicketRepository;
  await assert.rejects(assignTicket(repo, db, {
    tenantId, ticketId, actorId: otherId, actorRole: 'SURVEY_MANAGER',
    assignedPartyChiefId: chiefId, assignedInstrumentManId: instrumentId,
  }), ForbiddenError);
  assert.deepEqual(writes, []);
});

test('Slim direct assignment uses the Instrument Man and Survey Manager approval chain', async () => {
  const current = ticket('CREATED');
  current.workflowVariant = 'DIRECT_ASSIGNMENT';
  const events: string[] = [];
  const db: DbClient = { async query(_sql, params) {
    const event = params?.find(value => typeof value === 'string' && value.startsWith('ticket.'));
    if (typeof event === 'string') events.push(event);
    return { rows: [] };
  } };
  const repo = {
    findByIdInternal: async () => current,
    findActiveProjectCrewBuild: async () => 'SLIM',
    isProjectAssignee: async (_db: DbClient, _tenant: UUID, _project: UUID,
      userId: UUID, role: string) => userId === instrumentId && role === 'INSTRUMENT_MAN',
    findResponsibleSuperintendent: async () => { throw new Error('Slim has no Superintendent'); },
    patchTicket: async (_db: DbClient, _tenant: UUID, _id: UUID, patch: Partial<Ticket>) => {
      Object.assign(current, patch);
    },
  } as unknown as ITicketRepository;
  const assigned = await assignTicket(repo, db, {
    tenantId, ticketId, actorId: otherId, actorRole: 'SURVEY_MANAGER',
    assignedPartyChiefId: null, assignedInstrumentManId: instrumentId,
  });
  assert.equal(assigned.status, 'ASSIGNED');
  assert.equal(assigned.assignedPartyChiefId, null);
  assert.equal(assigned.assignedInstrumentManId, instrumentId);
  await assert.rejects(startTicket(repo, db, { tenantId, ticketId,
    actorId: chiefId, actorRole: 'PARTY_CHIEF' }), ForbiddenError);
  assert.equal((await startTicket(repo, db, { tenantId, ticketId,
    actorId: instrumentId, actorRole: 'INSTRUMENT_MAN' })).status, 'IN_PROGRESS');
  assert.equal((await completeTicket(repo, db, { tenantId, ticketId,
    actorId: instrumentId, actorRole: 'INSTRUMENT_MAN' })).status, 'PENDING_PC_APPROVAL');
  await assert.rejects(completeTicket(repo, db, { tenantId, ticketId,
    actorId: chiefId, actorRole: 'PARTY_CHIEF' }), ForbiddenError);
  assert.equal((await completeTicket(repo, db, { tenantId, ticketId,
    actorId: otherId, actorRole: 'SURVEY_MANAGER' })).status, 'COMPLETED');
  assert.ok(events.includes('ticket.pc_approval_given'));
  assert.ok(events.includes('ticket.completed'));
  assert.ok(!events.includes('ticket.pc_approval_overridden'));
});

test('Slim assignment rejects a Party Chief or missing and ineligible Instrument Man', async () => {
  const writes: string[] = [];
  const db: DbClient = { async query(sql) { writes.push(sql); return { rows: [] }; } };
  const repo = {
    findByIdInternal: async () => ticket('CREATED'),
    findActiveProjectCrewBuild: async () => 'SLIM',
    isProjectAssignee: async () => false,
    patchTicket: async () => { writes.push('patch'); },
  } as unknown as ITicketRepository;
  const base = { tenantId, ticketId, actorId: otherId,
    actorRole: 'SURVEY_MANAGER' as const };
  await assert.rejects(assignTicket(repo, db, { ...base,
    assignedPartyChiefId: chiefId, assignedInstrumentManId: instrumentId }), ValidationError);
  await assert.rejects(assignTicket(repo, db, { ...base,
    assignedPartyChiefId: null, assignedInstrumentManId: null }), ValidationError);
  await assert.rejects(assignTicket(repo, db, { ...base,
    assignedPartyChiefId: null, assignedInstrumentManId: instrumentId }), ForbiddenError);
  assert.deepEqual(writes, []);
});

test('Full and Medium assignment still require a Party Chief and an active project', async () => {
  const writes: string[] = [];
  const db: DbClient = { async query(sql) { writes.push(sql); return { rows: [] }; } };
  let crewBuild: 'FULL' | 'MEDIUM' | null = 'MEDIUM';
  const repo = {
    findByIdInternal: async () => ticket('APPROVED'),
    findActiveProjectCrewBuild: async () => crewBuild,
    isProjectAssignee: async () => true,
    findResponsibleSuperintendent: async () => null,
    patchTicket: async () => { writes.push('patch'); },
  } as unknown as ITicketRepository;
  const base = { tenantId, ticketId, actorId: otherId,
    actorRole: 'SURVEY_MANAGER' as const };
  await assert.rejects(assignTicket(repo, db, { ...base,
    assignedPartyChiefId: null, assignedInstrumentManId: instrumentId }), ValidationError);
  crewBuild = null;
  await assert.rejects(assignTicket(repo, db, { ...base,
    assignedPartyChiefId: chiefId, assignedInstrumentManId: instrumentId }), ConflictError);
  crewBuild = 'MEDIUM';
  assert.equal((await assignTicket(repo, db, { ...base,
    assignedPartyChiefId: chiefId, assignedInstrumentManId: instrumentId })).status, 'ASSIGNED');
  assert.equal(writes.filter(value => value === 'patch').length, 1);
});

test('Superintendent assigns a crew only within their active AOR', async () => {
  const current = ticket('APPROVED');
  const writes: string[] = [];
  const db: DbClient = { async query(sql) { writes.push(sql); return { rows: [] }; } };
  let actorInScope = false;
  let chiefInScope = false;
  const repo = {
    findByIdInternal: async () => current,
    findActiveProjectCrewBuild: async () => 'FULL',
    isAorNodeInSurveyRoleScope: async (_db: DbClient, _tenant: UUID,
      _project: UUID, _user: UUID, _node: UUID, role: string) =>
      role === 'SURVEY_SUPERINTENDENT' ? actorInScope : chiefInScope,
    isProjectAssignee: async () => true,
    patchTicket: async (_db: DbClient, _tenant: UUID, _id: UUID,
      patch: Partial<Ticket>) => { Object.assign(current, patch); writes.push('patch'); },
  } as unknown as ITicketRepository;
  const input = { tenantId, ticketId, actorId: otherId,
    actorRole: 'SURVEY_SUPERINTENDENT' as const,
    assignedPartyChiefId: chiefId, assignedInstrumentManId: instrumentId };
  await assert.rejects(assignTicket(repo, db, input), ForbiddenError);
  assert.deepEqual(writes, []);
  actorInScope = true;
  await assert.rejects(assignTicket(repo, db, input), ForbiddenError);
  assert.deepEqual(writes, []);
  chiefInScope = true;
  const assigned = await assignTicket(repo, db, input);
  assert.equal(assigned.status, 'ASSIGNED');
  assert.equal(assigned.surveySuperintendentId, otherId);
  assert.equal(assigned.surveyManagerId, null);
  assert.equal(writes.filter(value => value === 'patch').length, 1);
  assert.equal(writes.filter(value => /INSERT INTO ticket_events/.test(value)).length, 1);
});

test('Superintendent AOR lookup is tenant-scoped and includes retired ticket nodes', async () => {
  const queries: string[] = [];
  const db: DbClient = { async query(sql) { queries.push(sql); return { rows: [] }; } };
  assert.equal(await new TicketRepository().isAorNodeInSurveyRoleScope(
    db, tenantId, projectId, otherId, ticket('APPROVED').aorNodeId!,
    'SURVEY_SUPERINTENDENT'), false);
  assert.match(queries[0] ?? '', /WITH RECURSIVE ancestors/);
  assert.match(queries[0] ?? '', /aa\.tenant_id = \$1/);
  assert.match(queries[0] ?? '', /aa\.deactivated_at IS NULL/);
  assert.match(queries[0] ?? '', /u\.deactivated_at IS NULL/);
  assert.doesNotMatch(queries[0] ?? '', /retired_at/);
});

test('assignment eligibility lookup requires active tenant project and active user', async () => {
  const seen: string[] = [];
  const db: DbClient = { async query(sql) { seen.push(sql); return { rows: [] }; } };
  const repo = new TicketRepository();
  assert.equal(await repo.findActiveProjectCrewBuild(db, tenantId, projectId), null);
  await repo.isProjectAssignee(db, tenantId, projectId, instrumentId, 'INSTRUMENT_MAN');
  assert.match(seen[0] ?? '', /tenant_id = \$2 AND status = 'ACTIVE'/);
  assert.match(seen[1] ?? '', /p\.status = 'ACTIVE' AND u\.deactivated_at IS NULL/);
});

test('Survey Manager cannot approve a ticket they requested', async () => {
  const { db, repo, writes } = context('SUBMITTED');
  await assert.rejects(approveTicket(repo, db, {
    tenantId, ticketId, actorId: requesterId, actorRole: 'SURVEY_MANAGER',
  }), ForbiddenError);
  assert.deepEqual(writes, []);
});

test('creation fails closed before sequence allocation when resources do not match', async () => {
  let saved = false;
  const repo = {
    findCreationAorCode: async () => null,
    nextSequence: async () => { saved = true; return 1; },
    save: async () => { saved = true; },
  } as unknown as ITicketRepository;
  const db: DbClient = { async query() { return { rows: [] }; } };
  await assert.rejects(createTicket(repo, db, {
    tenantId, projectId, requesterId, requesterEmail: 'user@example.com',
    aorNodeId: id('00000000-0000-0000-0000-000000000008'),
    companyId: id('00000000-0000-0000-0000-000000000010'),
    ticketType: 'LAYOUT', workflowVariant: 'STANDARD_APPROVAL',
    craft: 'Pipe', description: 'Layout', requestedDate: new Date('2026-10-01'),
  }), NotFoundError);
  assert.equal(saved, false);
});

test('creation and visibility SQL bind project, AOR, company, and subcontractor scope', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const db: DbClient = {
    async query(sql, params) { queries.push({ sql, params }); return { rows: [] }; },
  };
  const repo = new TicketRepository();
  await repo.findCreationAorCode(db, {
    tenantId, projectId, requesterId,
    aorNodeId: id('00000000-0000-0000-0000-000000000008'),
    companyId: id('00000000-0000-0000-0000-000000000010'),
  });
  assert.match(queries[0]?.sql ?? '', /JOIN project_memberships pm/);
  assert.match(queries[0]?.sql ?? '', /pm\.role = 'REQUESTER'/);
  assert.match(queries[0]?.sql ?? '', /JOIN aor_nodes n/);
  assert.match(queries[0]?.sql ?? '', /u\.company_id = c\.id/);

  await repo.findByIdInternal(db, tenantId, ticketId);
  assert.match(queries[1]?.sql ?? '', /FOR UPDATE/);

  await repo.findById(db, tenantId, ticketId, {
    actorId: requesterId, actorRole: 'VIEWER',
    companyId: id('00000000-0000-0000-0000-000000000010'),
    companyType: 'SUBCONTRACTOR',
  });
  assert.match(queries[2]?.sql ?? '', /t\.company_id = \$3/);
  await repo.findById(db, tenantId, ticketId, {
    actorId: requesterId, actorRole: 'VIEWER',
    companyId: id('00000000-0000-0000-0000-000000000010'),
    companyType: 'GC',
  });
  assert.doesNotMatch(queries[3]?.sql ?? '', /t\.company_id/);
});

test('field cancellation requires the assigned IM and first authorized responder', async () => {
  const current = ticket('IN_PROGRESS');
  current.surveySuperintendentId = otherId;
  const writes: string[] = [];
  const db: DbClient = { async query(sql) { writes.push(sql); return { rows: [] }; } };
  const repo = {
    findByIdInternal: async () => current,
    findActiveProjectCrewBuild: async () => 'FULL',
    patchTicket: async (_db: DbClient, _tenant: UUID, _id: UUID, patch: Partial<Ticket>) => {
      Object.assign(current, patch); writes.push('patch');
    },
  } as unknown as ITicketRepository;
  await assert.rejects(submitFieldStatus(repo, db, { tenantId, ticketId,
    actorId: chiefId, actorRole: 'INSTRUMENT_MAN', requestedStatus: 'FIELD_CANCELED' }), ForbiddenError);
  assert.deepEqual(writes, []);
  await submitFieldStatus(repo, db, { tenantId, ticketId, actorId: instrumentId,
    actorRole: 'INSTRUMENT_MAN', requestedStatus: 'FIELD_CANCELED', reason: 'Unsafe access' });
  assert.equal(current.pendingFieldStatus, 'FIELD_CANCELED');
  await assert.rejects(resolveFieldStatus(repo, db, { tenantId, ticketId,
    actorId: requesterId, actorRole: 'REQUESTER', approve: true }), ForbiddenError);
  const approved = await resolveFieldStatus(repo, db, { tenantId, ticketId,
    actorId: otherId, actorRole: 'SURVEY_SUPERINTENDENT', approve: true });
  assert.equal(approved.status, 'FIELD_CANCELED');
  assert.equal(approved.cancelApprovedBy, otherId);
  await assert.rejects(resolveFieldStatus(repo, db, { tenantId, ticketId,
    actorId: chiefId, actorRole: 'PARTY_CHIEF', approve: true }));
  assert.ok(writes.filter(sql => /INSERT INTO ticket_events/.test(sql)).length >= 3);
});

test('survey cancellation enforces PC to Superintendent to Manager chain', async () => {
  const current = ticket('ASSIGNED');
  current.surveySuperintendentId = otherId;
  const writes: string[] = [];
  const db: DbClient = { async query(sql) { writes.push(sql); return { rows: [] }; } };
  const repo = {
    findByIdInternal: async () => current,
    findActiveProjectCrewBuild: async () => 'FULL',
    patchTicket: async (_db: DbClient, _tenant: UUID, _id: UUID, patch: Partial<Ticket>) => {
      Object.assign(current, patch); writes.push('patch');
    },
  } as unknown as ITicketRepository;
  await assert.rejects(initiateSurveyCancel(repo, db, { tenantId, ticketId,
    actorId: instrumentId, actorRole: 'INSTRUMENT_MAN', reason: 'Stop' }), ForbiddenError);
  await initiateSurveyCancel(repo, db, { tenantId, ticketId,
    actorId: chiefId, actorRole: 'PARTY_CHIEF', reason: 'Design revision' });
  await assert.rejects(initiateSurveyCancel(repo, db, { tenantId, ticketId,
    actorId: chiefId, actorRole: 'PARTY_CHIEF', reason: 'Duplicate' }));
  await assert.rejects(approveSurveyCancel(repo, db, { tenantId, ticketId,
    actorId: chiefId, actorRole: 'PARTY_CHIEF' }), ForbiddenError);
  const result = await approveSurveyCancel(repo, db, { tenantId, ticketId,
    actorId: otherId, actorRole: 'SURVEY_SUPERINTENDENT' });
  assert.equal(result.status, 'SURVEY_CANCELED');
  assert.equal(result.cancelApprovedBy, otherId);
  assert.ok(writes.some(sql => /INSERT INTO ticket_events/.test(sql)));
});
