import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, ValidationError } from '@/shared/errors';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const requesterId = 'requester-1' as UUID;
const departmentId = 'department-1' as UUID;
const seventyTwoHoursFromNow = () => new Date(Date.now() + (72 * 60 * 60 * 1000));

function makeDraftTicket(overrides?: Partial<Ticket>): Ticket {
  const now = new Date('2026-03-04T12:00:00Z');

  return {
    id: ticketId,
    tenantId,
    projectId,
    aorNodeId: 'aor-node-1' as UUID,
    departmentId,
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
    fieldContact: 'Foreman A',
    fieldChannel: 'CH-11',
    description: 'Draft ticket',
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
    findByIdInternal: async () => null,
    save: async () => undefined,
    saveCadWork: async () => undefined,
    findProjectStatus: async () => 'ACTIVE',
    nextSequence: async () => 1,
    findAorNodeCode: async () => 'U1',
    findDepartmentById: async (_db, _tenantId, _projectId, requestedDepartmentId) => ({
      id: requestedDepartmentId,
    }),
    findRequesterDepartmentMembership: async () => null,
    findDepartmentTitlePriority: async () => null,
    isEmailWhitelisted: async () => false,
    patchTicket: async () => undefined,
    list: async () => ({ data: [], total: 0, limit: 50, offset: 0 }),
    findUserCompanyInfo: async () => null,
    findUserEmail: async () => null,
    findPartyChiefForInstrumentMan: async () => null,
    findAorNodeIdsForUser: async () => [],
    findProjectLeadTimeConfig: async () => ({
      enforcementEnabled: true,
      leadTimeDays: 2,
    }),
    ...overrides,
  };
}

test('createTicket leaves ticketNumber null until submission', async () => {
  const savedTickets: Ticket[] = [];
  let nextSequenceCalls = 0;
  let findAorNodeCodeCalls = 0;
  const dbCalls: string[] = [];

  const repo = makeRepo({
    save: async (_db, ticket) => {
      savedTickets.push(ticket);
    },
    nextSequence: async () => {
      nextSequenceCalls += 1;
      return 1;
    },
    findAorNodeCode: async () => {
      findAorNodeCodeCalls += 1;
      return 'U1';
    },
  });

  const db: DbClient = {
    query: async (sql) => {
      dbCalls.push(sql);
      return { rows: [] };
    },
  };

  const ticket = await createTicket(repo, db, {
    tenantId,
    projectId,
    aorNodeId: 'aor-node-1' as UUID,
    companyId: 'company-1' as UUID,
    requesterId,
    ticketType: 'LAYOUT',
    workflowVariant: 'STANDARD_APPROVAL',
    craft: 'Civil',
    description: 'Needs layout',
    requestedDate: seventyTwoHoursFromNow(),
  });

  assert.equal(ticket.ticketNumber, null);
  assert.equal(savedTickets[0]?.ticketNumber, null);
  assert.equal(nextSequenceCalls, 0);
  assert.equal(findAorNodeCodeCalls, 0);
  assert.equal(dbCalls.length, 1);
  assert.match(dbCalls[0] ?? '', /INSERT INTO ticket_events/);
});

test('createTicket rejects direct-assignment creation through the requester draft path', async () => {
  const repo = makeRepo();
  const db: DbClient = {
    query: async () => ({ rows: [] }),
  };

  await assert.rejects(
    () => createTicket(repo, db, {
      tenantId,
      projectId,
      aorNodeId: 'aor-node-1' as UUID,
      companyId: 'company-1' as UUID,
      requesterId,
      ticketType: 'LAYOUT',
      workflowVariant: 'DIRECT_ASSIGNMENT',
      craft: 'Civil',
      description: 'Needs layout',
      requestedDate: seventyTwoHoursFromNow(),
    }),
    ValidationError,
  );
});

test('submitTicket assigns ticketNumber when the draft is submitted', async () => {
  const patchCalls: Array<Record<string, unknown>> = [];
  let nextSequenceCalls = 0;
  let findAorNodeCodeCalls = 0;
  const dbCalls: string[] = [];

  const repo = makeRepo({
    findByIdInternal: async () => makeDraftTicket(),
    patchTicket: async (_db, _tenantId, _ticketId, patch) => {
      patchCalls.push(patch as unknown as Record<string, unknown>);
    },
    nextSequence: async () => {
      nextSequenceCalls += 1;
      return 42;
    },
    findAorNodeCode: async () => {
      findAorNodeCodeCalls += 1;
      return 'U1';
    },
  });

  const db: DbClient = {
    query: async (sql) => {
      dbCalls.push(sql);
      return { rows: [] };
    },
  };

  const result = await submitTicket(repo, db, {
    tenantId,
    ticketId,
    actorId: requesterId,
    actorRole: 'REQUESTER',
  });

  assert.equal(result.status, 'SUBMITTED');
  assert.equal(result.ticketNumber, 'FSS-U1-00042');
  assert.equal(patchCalls.length, 1);
  assert.equal(patchCalls[0]?.status, 'SUBMITTED');
  assert.equal(patchCalls[0]?.departmentId, departmentId);
  assert.equal(patchCalls[0]?.priority, 'NORMAL');
  assert.equal(patchCalls[0]?.ticketNumber, 'FSS-U1-00042');
  assert.equal(nextSequenceCalls, 1);
  assert.equal(findAorNodeCodeCalls, 1);
  assert.equal(dbCalls.length, 1);
  assert.match(dbCalls[0] ?? '', /INSERT INTO ticket_events/);
});

test('submitTicket enforces configured lead-time before allocating a number', async () => {
  let nextSequenceCalls = 0;
  let findAorNodeCodeCalls = 0;

  const repo = makeRepo({
    findByIdInternal: async () => makeDraftTicket({
      requestedDate: new Date(Date.now() + (36 * 60 * 60 * 1000)),
    }),
    findProjectLeadTimeConfig: async () => ({
      enforcementEnabled: true,
      leadTimeDays: 2,
    }),
    nextSequence: async () => {
      nextSequenceCalls += 1;
      return 7;
    },
    findAorNodeCode: async () => {
      findAorNodeCodeCalls += 1;
      return 'U1';
    },
  });

  const db: DbClient = {
    query: async () => ({ rows: [] }),
  };

  await assert.rejects(
    () => submitTicket(repo, db, {
      tenantId,
      ticketId,
      actorId: requesterId,
      actorRole: 'REQUESTER',
    }),
    ValidationError,
  );

  assert.equal(nextSequenceCalls, 0);
  assert.equal(findAorNodeCodeCalls, 0);
});

test('submitTicket skips lead-time validation when enforcement is disabled', async () => {
  const repo = makeRepo({
    findByIdInternal: async () => makeDraftTicket({
      requestedDate: new Date(Date.now() + (6 * 60 * 60 * 1000)),
    }),
    findProjectLeadTimeConfig: async () => ({
      enforcementEnabled: false,
      leadTimeDays: 10,
    }),
  });

  const db: DbClient = {
    query: async () => ({ rows: [] }),
  };

  const result = await submitTicket(repo, db, {
    tenantId,
    ticketId,
    actorId: requesterId,
    actorRole: 'REQUESTER',
  });

  assert.equal(result.status, 'SUBMITTED');
});

test('submitTicket returns deterministic stale-state conflict when draft changed concurrently', async () => {
  const repo = makeRepo({
    findByIdInternal: async () => makeDraftTicket({
      rowVersion: 3,
    }),
    patchTicket: async () => {
      throw new ConflictError(
        'Ticket changed since it was loaded. Refresh and retry your action.',
        'WORKFLOW_STALE_STATE',
      );
    },
  });

  const db: DbClient = {
    query: async () => ({ rows: [] }),
  };

  await assert.rejects(
    () => submitTicket(repo, db, {
      tenantId,
      ticketId,
      actorId: requesterId,
      actorRole: 'REQUESTER',
    }),
    (err: unknown) =>
      err instanceof ConflictError &&
      err.code === 'WORKFLOW_STALE_STATE',
  );
});
