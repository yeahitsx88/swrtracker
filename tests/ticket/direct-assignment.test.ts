import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { createDirectAssignmentTicket } from '@/modules/ticket/application/create-direct-assignment-ticket';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const requesterId = 'requester-1' as UUID;
const actorId = 'manager-1' as UUID;
const departmentId = 'department-1' as UUID;

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
    findUserCompanyInfo: async () => ({
      companyId: 'company-1' as UUID,
      companyType: 'GC',
    }),
    findUserEmail: async () => 'requester@example.com',
    findPartyChiefForInstrumentMan: async () => null,
    findAorNodeIdsForUser: async () => [],
    ...overrides,
  };
}

test('createDirectAssignmentTicket creates a direct-assignment ticket in ASSIGNED status with immediate crew context', async () => {
  const savedTickets: Ticket[] = [];
  const dbCalls: Array<{ sql: string; params?: unknown[] }> = [];

  const repo = makeRepo({
    save: async (_db, ticket) => {
      savedTickets.push(ticket);
    },
    findRequesterDepartmentMembership: async () => ({
      departmentId,
      title: 'QA Manager',
    }),
    findDepartmentTitlePriority: async () => 'MED_HIGH',
    nextSequence: async () => 42,
  });
  const db: DbClient = {
    query: async (sql, params) => {
      dbCalls.push({ sql, params });
      return { rows: [] };
    },
  };

  const ticket = await createDirectAssignmentTicket(repo, db, {
    tenantId,
    projectId,
    aorNodeId: 'aor-node-1' as UUID,
    requesterId,
    actorId,
    actorRole: 'SURVEY_MANAGER',
    assignedPartyChiefId: 'pc-1' as UUID,
    assignedInstrumentManId: 'im-1' as UUID,
    ticketType: 'LAYOUT',
    craft: 'Civil',
    description: 'Urgent work',
    requestedDate: new Date(Date.now() + (2 * 60 * 60 * 1000)),
  });

  assert.equal(ticket.workflowVariant, 'DIRECT_ASSIGNMENT');
  assert.equal(ticket.status, 'ASSIGNED');
  assert.equal(ticket.ticketNumber, 'FSS-U1-00042');
  assert.equal(ticket.departmentId, departmentId);
  assert.equal(ticket.priority, 'MED_HIGH');
  assert.equal(ticket.assignedPartyChiefId, 'pc-1');
  assert.equal(ticket.assignedInstrumentManId, 'im-1');
  assert.equal(ticket.surveyLeadId, actorId);
  assert.ok(ticket.assignedAt instanceof Date);
  assert.equal(savedTickets.length, 1);
  assert.equal(savedTickets[0]?.status, 'ASSIGNED');
  assert.equal(dbCalls.length, 2);
  assert.deepEqual(
    dbCalls.map((call) => call.params?.[4] as string),
    ['ticket.created', 'ticket.assigned'],
  );
});

test('createDirectAssignmentTicket accepts manual department fallback and whitelist override', async () => {
  const dbCalls: Array<{ sql: string; params?: unknown[] }> = [];
  const repo = makeRepo({
    isEmailWhitelisted: async () => true,
    nextSequence: async () => 7,
  });
  const db: DbClient = {
    query: async (sql, params) => {
      dbCalls.push({ sql, params });
      return { rows: [] };
    },
  };

  const ticket = await createDirectAssignmentTicket(repo, db, {
    tenantId,
    projectId,
    aorNodeId: 'aor-node-1' as UUID,
    requesterId,
    actorId,
    actorRole: 'SURVEY_SUPERINTENDENT',
    assignedPartyChiefId: 'pc-1' as UUID,
    assignedInstrumentManId: null,
    departmentId,
    ticketType: 'TOPO',
    craft: 'Civil',
    description: 'Urgent topo',
    requestedDate: new Date(Date.now() + (60 * 60 * 1000)),
  });

  assert.equal(ticket.departmentId, departmentId);
  assert.equal(ticket.priority, 'HIGH');
  assert.equal(ticket.ticketNumber, 'FSS-U1-00007');
  assert.deepEqual(
    dbCalls.map((call) => call.params?.[4] as string),
    ['ticket.created', 'ticket.assigned', 'ticket.priority_set_by_whitelist'],
  );
});

test('createDirectAssignmentTicket rejects actors outside the survey leadership roles', async () => {
  const repo = makeRepo();
  const db: DbClient = {
    query: async () => ({ rows: [] }),
  };

  await assert.rejects(
    () => createDirectAssignmentTicket(repo, db, {
      tenantId,
      projectId,
      aorNodeId: 'aor-node-1' as UUID,
      requesterId,
      actorId,
      actorRole: 'REQUESTER',
      assignedPartyChiefId: 'pc-1' as UUID,
      assignedInstrumentManId: null,
      departmentId,
      ticketType: 'LAYOUT',
      craft: 'Civil',
      description: 'Urgent work',
      requestedDate: new Date(Date.now() + (60 * 60 * 1000)),
    }),
    ForbiddenError,
  );
});

test('createDirectAssignmentTicket requires a Party Chief assignment', async () => {
  const repo = makeRepo();
  const db: DbClient = {
    query: async () => ({ rows: [] }),
  };

  await assert.rejects(
    () => createDirectAssignmentTicket(repo, db, {
      tenantId,
      projectId,
      aorNodeId: 'aor-node-1' as UUID,
      requesterId,
      actorId,
      actorRole: 'SURVEY_MANAGER',
      assignedPartyChiefId: '' as UUID,
      assignedInstrumentManId: null,
      departmentId,
      ticketType: 'LAYOUT',
      craft: 'Civil',
      description: 'Urgent work',
      requestedDate: new Date(Date.now() + (60 * 60 * 1000)),
    }),
    ValidationError,
  );
});
