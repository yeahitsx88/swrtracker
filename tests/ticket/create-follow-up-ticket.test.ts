import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { COOKIE_NAME, signToken } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { POST as followUpRoute } from '@/app/api/tickets/[ticketId]/follow-up/route';
import { createFollowUpTicket } from '@/modules/ticket/application/create-follow-up-ticket';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const requesterId = 'requester-1' as UUID;
const parentTicketId = 'parent-1' as UUID;

function completedTicket(overrides: Partial<Ticket> = {}): Ticket {
  const now = new Date('2026-09-20T12:00:00Z');
  return {
    id: parentTicketId,
    tenantId,
    projectId,
    aorNodeId: 'aor-1' as UUID,
    departmentId: 'department-1' as UUID,
    companyId: 'company-1' as UUID,
    ticketNumber: 'FSS-A1-00001',
    ticketType: 'LAYOUT',
    requesterId,
    assignedPartyChiefId: 'chief-1' as UUID,
    assignedInstrumentManId: 'instrument-1' as UUID,
    surveyLeadId: 'lead-1' as UUID,
    workflowVariant: 'STANDARD_APPROVAL',
    status: 'COMPLETED',
    craft: 'Civil',
    fieldContact: 'Foreman A',
    fieldChannel: 'CH-11',
    description: 'Lay out anchor bolts',
    requestedDate: new Date('2026-09-18T12:00:00Z'),
    submittedAt: new Date('2026-09-16T12:00:00Z'),
    approvedAt: new Date('2026-09-16T13:00:00Z'),
    assignedAt: new Date('2026-09-16T14:00:00Z'),
    startedAt: new Date('2026-09-17T12:00:00Z'),
    pendingPcOutcome: null,
    pendingPcReason: null,
    surveyCancelRequestedBy: null,
    surveyCancelRequestedRole: null,
    surveyCancelReason: null,
    surveyCancelRequestedAt: null,
    completedAt: now,
    closedAt: null,
    rejectionReason: null,
    parentTicketId: null,
    priority: 'NORMAL',
    prioritySetBy: null,
    prioritySetReason: null,
    createdAt: new Date('2026-09-15T12:00:00Z'),
    updatedAt: now,
    ...overrides,
  };
}

function makeRepo(parent: Ticket | null, saved: Ticket[]): ITicketRepository {
  return {
    findById: async () => null,
    findByIdInternal: async (_db, requestedTenantId, requestedTicketId) => {
      assert.equal(requestedTenantId, tenantId);
      assert.equal(requestedTicketId, parentTicketId);
      return parent;
    },
    save: async (_db, ticket) => { saved.push(ticket); },
    saveCadWork: async () => undefined,
    nextSequence: async () => 1,
    findAorNodeCode: async () => 'A1',
    findDepartmentById: async () => null,
    findRequesterDepartmentMembership: async () => null,
    findDepartmentTitlePriority: async () => null,
    isEmailWhitelisted: async () => false,
    patchTicket: async () => undefined,
    list: async () => ({ data: [], total: 0, limit: 20, offset: 0 }),
    findUserCompanyInfo: async () => null,
    findUserEmail: async () => null,
    findPartyChiefForInstrumentMan: async () => null,
    findAorNodeIdsForUser: async () => [],
    findProjectStatus: async (_db, requestedTenantId, requestedProjectId) => {
      assert.equal(requestedTenantId, tenantId);
      assert.equal(requestedProjectId, projectId);
      return 'ACTIVE';
    },
    findProjectLeadTimeConfig: async () => ({ enforcementEnabled: true, leadTimeDays: 2 }),
  };
}

const db: DbClient = { query: async () => ({ rows: [] }) };

type IdempotencyRow = {
  requestHash: string;
  responseStatus: number | null;
  responseBody: unknown;
};

type PoolLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  connect: () => Promise<{
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    release: () => void;
  }>;
};

test('requester creates an editable draft linked to their completed SWR', async () => {
  const parent = completedTicket();
  const saved: Ticket[] = [];
  const now = new Date('2026-09-24T12:00:00Z');

  const followUp = await createFollowUpTicket(makeRepo(parent, saved), db, {
    tenantId,
    parentTicketId,
    actorId: requesterId,
    actorRole: 'REQUESTER',
    now,
  });

  assert.equal(followUp.status, 'DRAFT');
  assert.equal(followUp.parentTicketId, parent.id);
  assert.equal(followUp.ticketNumber, null);
  assert.equal(followUp.projectId, parent.projectId);
  assert.equal(followUp.aorNodeId, parent.aorNodeId);
  assert.equal(followUp.departmentId, parent.departmentId);
  assert.equal(followUp.companyId, parent.companyId);
  assert.equal(followUp.ticketType, parent.ticketType);
  assert.equal(followUp.craft, parent.craft);
  assert.equal(followUp.fieldContact, parent.fieldContact);
  assert.equal(followUp.fieldChannel, parent.fieldChannel);
  assert.equal(followUp.description, parent.description);
  assert.equal(followUp.requestedDate.toISOString(), '2026-09-27T12:00:00.000Z');
  assert.equal(followUp.requesterId, requesterId);
  assert.equal(saved.length, 1);
  assert.equal(parent.status, 'COMPLETED');
  assert.equal(parent.parentTicketId, null);
});

test('company authority cannot create a follow-up from another requester\'s visible SWR', async () => {
  const saved: Ticket[] = [];
  await assert.rejects(
    () => createFollowUpTicket(makeRepo(completedTicket(), saved), db, {
      tenantId,
      parentTicketId,
      actorId: 'authority-1' as UUID,
      actorRole: 'REQUESTER',
    }),
    (error: unknown) => error instanceof ForbiddenError && /your own/.test(error.message),
  );
  assert.equal(saved.length, 0);
});

test('follow-up creation requires an existing completed parent in the same tenant', async () => {
  await assert.rejects(
    () => createFollowUpTicket(makeRepo(completedTicket({ status: 'IN_PROGRESS' }), []), db, {
      tenantId,
      parentTicketId,
      actorId: requesterId,
      actorRole: 'REQUESTER',
    }),
    ConflictError,
  );

  await assert.rejects(
    () => createFollowUpTicket(makeRepo(null, []), db, {
      tenantId,
      parentTicketId,
      actorId: requesterId,
      actorRole: 'REQUESTER',
    }),
    NotFoundError,
  );
});

test('follow-up route replays an idempotency key without creating a second draft', async () => {
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.DATABASE_URL ??= 'postgres://local/test';
  const pool = getPool() as unknown as PoolLike;
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const originalFindUserCompanyInfo = TicketRepository.prototype.findUserCompanyInfo;
  const originalFindById = TicketRepository.prototype.findById;
  const originalFindByIdInternal = TicketRepository.prototype.findByIdInternal;
  const originalFindProjectStatus = TicketRepository.prototype.findProjectStatus;
  const originalFindProjectLeadTimeConfig = TicketRepository.prototype.findProjectLeadTimeConfig;
  const originalSave = TicketRepository.prototype.save;
  const originalSaveCadWork = TicketRepository.prototype.saveCadWork;
  const idempotencyRows = new Map<string, IdempotencyRow>();
  let saveCalls = 0;

  pool.query = async (sql: string) => {
    if (/SELECT project_id FROM tickets/.test(sql)) return { rows: [{ project_id: projectId }] };
    if (/FROM users/.test(sql)) return { rows: [{ session_version: 1, deactivated_at: null }] };
    if (/SELECT role\s+FROM project_memberships/.test(sql)) return { rows: [{ role: 'REQUESTER' }] };
    return { rows: [] };
  };
  pool.connect = async () => ({
    query: async (sql: string, params?: unknown[]) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rows: [] };
      if (/INSERT INTO api_idempotency/.test(sql)) {
        const key = `${params?.[0]}|${params?.[1]}|${params?.[2]}|${params?.[3]}`;
        if (idempotencyRows.has(key)) return { rows: [] };
        idempotencyRows.set(key, {
          requestHash: params?.[4] as string,
          responseStatus: null,
          responseBody: null,
        });
        return { rows: [{ idempotency_key: params?.[3] }] };
      }
      if (/SELECT request_hash, response_status, response_body/.test(sql)) {
        const key = `${params?.[0]}|${params?.[1]}|${params?.[2]}|${params?.[3]}`;
        const row = idempotencyRows.get(key);
        return { rows: row ? [{
          request_hash: row.requestHash,
          response_status: row.responseStatus,
          response_body: row.responseBody,
        }] : [] };
      }
      if (/UPDATE api_idempotency/.test(sql)) {
        const key = `${params?.[0]}|${params?.[1]}|${params?.[2]}|${params?.[3]}`;
        const row = idempotencyRows.get(key);
        if (row) {
          row.responseStatus = params?.[4] as number;
          row.responseBody = JSON.parse(params?.[5] as string);
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
    release: () => undefined,
  });
  TicketRepository.prototype.findUserCompanyInfo = async () => ({
    companyId: 'company-1' as UUID,
    companyType: 'SUBCONTRACTOR',
  });
  TicketRepository.prototype.findById = async () => completedTicket();
  TicketRepository.prototype.findByIdInternal = async () => completedTicket();
  TicketRepository.prototype.findProjectStatus = async () => 'ACTIVE';
  TicketRepository.prototype.findProjectLeadTimeConfig = async () => ({
    enforcementEnabled: true,
    leadTimeDays: 2,
  });
  TicketRepository.prototype.save = async () => { saveCalls += 1; };
  TicketRepository.prototype.saveCadWork = async () => undefined;

  try {
    const token = signToken(requesterId, tenantId);
    const makeRequest = () => new NextRequest(
      `http://localhost/api/tickets/${parentTicketId}/follow-up`,
      {
        method: 'POST',
        headers: {
          cookie: `${COOKIE_NAME}=${token}`,
          'idempotency-key': 'follow-up-retry-1',
        },
      },
    );
    const routeParams = { params: Promise.resolve({ ticketId: parentTicketId }) };
    const first = await followUpRoute(makeRequest(), routeParams);
    const second = await followUpRoute(makeRequest(), routeParams);
    const firstBody = await first.json() as { ticket: { id: string; parentTicketId: string } };
    const secondBody = await second.json() as { ticket: { id: string; parentTicketId: string } };

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(secondBody.ticket.id, firstBody.ticket.id);
    assert.equal(firstBody.ticket.parentTicketId, parentTicketId);
    assert.equal(saveCalls, 1);
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    TicketRepository.prototype.findUserCompanyInfo = originalFindUserCompanyInfo;
    TicketRepository.prototype.findById = originalFindById;
    TicketRepository.prototype.findByIdInternal = originalFindByIdInternal;
    TicketRepository.prototype.findProjectStatus = originalFindProjectStatus;
    TicketRepository.prototype.findProjectLeadTimeConfig = originalFindProjectLeadTimeConfig;
    TicketRepository.prototype.save = originalSave;
    TicketRepository.prototype.saveCadWork = originalSaveCadWork;
  }
});
