import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { COOKIE_NAME, signToken } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { POST as createTicketRoute } from '@/app/api/tickets/route';
import { POST as assignTicketRoute } from '@/app/api/tickets/[ticketId]/assign/route';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { UUID } from '@/shared/types';

type JsonObject = Record<string, unknown>;
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

function makeCreateRequest(
  token: string,
  body: JsonObject,
  idempotencyKey: string,
): NextRequest {
  return new NextRequest('http://localhost/api/tickets', {
    method: 'POST',
    headers: {
      cookie: `${COOKIE_NAME}=${token}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function makeAssignRequest(
  url: string,
  token: string,
  body: JsonObject,
  idempotencyKey: string,
): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      cookie: `${COOKIE_NAME}=${token}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function createTxQuery(rows: Map<string, IdempotencyRow>) {
  return async (sql: string, params?: unknown[]) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) {
      return { rows: [] };
    }
    if (/INSERT INTO api_idempotency/.test(sql)) {
      const key = `${params?.[0]}|${params?.[1]}|${params?.[2]}|${params?.[3]}`;
      if (rows.has(key)) return { rows: [] };
      rows.set(key, {
        requestHash: params?.[4] as string,
        responseStatus: null,
        responseBody: null,
      });
      return { rows: [{ idempotency_key: params?.[3] }] };
    }
    if (/SELECT request_hash, response_status, response_body/.test(sql)) {
      const key = `${params?.[0]}|${params?.[1]}|${params?.[2]}|${params?.[3]}`;
      const row = rows.get(key);
      if (!row) return { rows: [] };
      return {
        rows: [{
          request_hash: row.requestHash,
          response_status: row.responseStatus,
          response_body: row.responseBody,
        }],
      };
    }
    if (/UPDATE api_idempotency/.test(sql)) {
      const key = `${params?.[0]}|${params?.[1]}|${params?.[2]}|${params?.[3]}`;
      const row = rows.get(key);
      if (row) {
        row.responseStatus = params?.[4] as number;
        row.responseBody = JSON.parse(params?.[5] as string);
        rows.set(key, row);
      }
      return { rows: [] };
    }
    return { rows: [] };
  };
}

function makeDirectAssignmentTicket(overrides?: Partial<Ticket>): Ticket {
  const now = new Date('2026-03-05T17:00:00Z');
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
    assignedPartyChiefId: 'pc-1' as UUID,
    assignedInstrumentManId: null,
    surveyLeadId: 'manager-1' as UUID,
    workflowVariant: 'DIRECT_ASSIGNMENT',
    status: 'ASSIGNED',
    craft: 'Civil',
    description: 'direct assignment',
    requestedDate: new Date(Date.now() + (72 * 60 * 60 * 1000)),
    submittedAt: null,
    approvedAt: null,
    assignedAt: now,
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

test('POST /api/tickets replays duplicate create requests and suppresses second mutation', async () => {
  process.env.JWT_SECRET ??= 'test-secret';
  const pool = getPool() as unknown as PoolLike;
  const idempotencyRows = new Map<string, IdempotencyRow>();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const originalFindProjectStatus = TicketRepository.prototype.findProjectStatus;
  const originalFindUserCompanyInfo = TicketRepository.prototype.findUserCompanyInfo;
  const originalFindRequesterDepartmentMembership = TicketRepository.prototype.findRequesterDepartmentMembership;
  const originalSave = TicketRepository.prototype.save;
  const originalSaveCadWork = TicketRepository.prototype.saveCadWork;

  let saveCalls = 0;
  pool.query = async (sql: string) => {
    if (/FROM users/.test(sql)) {
      return { rows: [{ session_version: 1, deactivated_at: null }] };
    }
    if (/SELECT role\s+FROM project_memberships/.test(sql)) {
      return { rows: [{ role: 'REQUESTER' }] };
    }
    return { rows: [] };
  };
  pool.connect = async () => ({
    query: createTxQuery(idempotencyRows),
    release: () => undefined,
  });
  TicketRepository.prototype.findProjectStatus = async () => 'ACTIVE';
  TicketRepository.prototype.findUserCompanyInfo = async () => ({
    companyId: 'company-1' as UUID,
    companyType: 'GC',
  });
  TicketRepository.prototype.findRequesterDepartmentMembership = async () => null;
  TicketRepository.prototype.save = async () => {
    saveCalls += 1;
  };
  TicketRepository.prototype.saveCadWork = async () => undefined;

  try {
    const token = signToken('requester-1' as UUID, 'tenant-1' as UUID);
    const payload = {
      projectId: 'project-1',
      aorNodeId: 'aor-node-1',
      ticketType: 'LAYOUT',
      craft: 'Civil',
      description: 'Retry-safe create',
      requestedDate: new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString(),
    };

    const first = await createTicketRoute(makeCreateRequest(token, payload, 'create-retry-1'));
    const second = await createTicketRoute(makeCreateRequest(token, payload, 'create-retry-1'));

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const firstJson = await first.json() as { ticket: { id: string } };
    const secondJson = await second.json() as { ticket: { id: string } };
    assert.equal(secondJson.ticket.id, firstJson.ticket.id);
    assert.equal(saveCalls, 1);
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    TicketRepository.prototype.findProjectStatus = originalFindProjectStatus;
    TicketRepository.prototype.findUserCompanyInfo = originalFindUserCompanyInfo;
    TicketRepository.prototype.findRequesterDepartmentMembership = originalFindRequesterDepartmentMembership;
    TicketRepository.prototype.save = originalSave;
    TicketRepository.prototype.saveCadWork = originalSaveCadWork;
  }
});

test('POST /api/tickets rejects same key with different payload', async () => {
  process.env.JWT_SECRET ??= 'test-secret';
  const pool = getPool() as unknown as PoolLike;
  const idempotencyRows = new Map<string, IdempotencyRow>();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const originalFindProjectStatus = TicketRepository.prototype.findProjectStatus;
  const originalFindUserCompanyInfo = TicketRepository.prototype.findUserCompanyInfo;
  const originalFindRequesterDepartmentMembership = TicketRepository.prototype.findRequesterDepartmentMembership;
  const originalSave = TicketRepository.prototype.save;
  const originalSaveCadWork = TicketRepository.prototype.saveCadWork;

  pool.query = async (sql: string) => {
    if (/FROM users/.test(sql)) {
      return { rows: [{ session_version: 1, deactivated_at: null }] };
    }
    if (/SELECT role\s+FROM project_memberships/.test(sql)) {
      return { rows: [{ role: 'REQUESTER' }] };
    }
    return { rows: [] };
  };
  pool.connect = async () => ({
    query: createTxQuery(idempotencyRows),
    release: () => undefined,
  });
  TicketRepository.prototype.findProjectStatus = async () => 'ACTIVE';
  TicketRepository.prototype.findUserCompanyInfo = async () => ({
    companyId: 'company-1' as UUID,
    companyType: 'GC',
  });
  TicketRepository.prototype.findRequesterDepartmentMembership = async () => null;
  TicketRepository.prototype.save = async () => undefined;
  TicketRepository.prototype.saveCadWork = async () => undefined;

  try {
    const token = signToken('requester-1' as UUID, 'tenant-1' as UUID);
    const key = 'create-retry-2';
    const basePayload = {
      projectId: 'project-1',
      aorNodeId: 'aor-node-1',
      ticketType: 'LAYOUT',
      craft: 'Civil',
      description: 'First payload',
      requestedDate: new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString(),
    };
    const changedPayload = {
      ...basePayload,
      description: 'Second payload',
    };

    const first = await createTicketRoute(makeCreateRequest(token, basePayload, key));
    assert.equal(first.status, 201);

    const second = await createTicketRoute(makeCreateRequest(token, changedPayload, key));
    assert.equal(second.status, 409);
    const json = await second.json() as { error: { code: string } };
    assert.equal(json.error.code, 'IDEMPOTENCY_KEY_REUSE_MISMATCH');
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    TicketRepository.prototype.findProjectStatus = originalFindProjectStatus;
    TicketRepository.prototype.findUserCompanyInfo = originalFindUserCompanyInfo;
    TicketRepository.prototype.findRequesterDepartmentMembership = originalFindRequesterDepartmentMembership;
    TicketRepository.prototype.save = originalSave;
    TicketRepository.prototype.saveCadWork = originalSaveCadWork;
  }
});

test('POST /api/tickets/[ticketId]/assign replays duplicate assign requests', async () => {
  process.env.JWT_SECRET ??= 'test-secret';
  const pool = getPool() as unknown as PoolLike;
  const idempotencyRows = new Map<string, IdempotencyRow>();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const originalFindById = TicketRepository.prototype.findById;
  const originalPatchTicket = TicketRepository.prototype.patchTicket;

  let patchCalls = 0;
  let currentTicket = makeDirectAssignmentTicket();
  pool.query = async (sql: string, params?: unknown[]) => {
    if (/FROM users/.test(sql)) {
      return { rows: [{ session_version: 1, deactivated_at: null }] };
    }
    if (/SELECT project_id FROM tickets/.test(sql)) {
      return { rows: [{ project_id: 'project-1' }] };
    }
    if (/SELECT role\s+FROM project_memberships/.test(sql)) {
      return { rows: [{ role: 'SURVEY_MANAGER' }] };
    }
    return { rows: [] };
  };
  pool.connect = async () => ({
    query: createTxQuery(idempotencyRows),
    release: () => undefined,
  });
  TicketRepository.prototype.findById = async () => currentTicket;
  TicketRepository.prototype.patchTicket = async (_db, _tenantId, _ticketId, patch) => {
    patchCalls += 1;
    currentTicket = {
      ...currentTicket,
      ...patch,
      rowVersion: (currentTicket.rowVersion ?? 0) + 1,
      updatedAt: new Date(),
    };
  };

  try {
    const token = signToken('manager-1' as UUID, 'tenant-1' as UUID);
    const url = 'http://localhost/api/tickets/ticket-1/assign';
    const body = {
      assignedPartyChiefId: 'pc-2',
      assignedInstrumentManId: null,
    };

    const first = await assignTicketRoute(
      makeAssignRequest(url, token, body, 'assign-retry-1'),
      { params: Promise.resolve({ ticketId: 'ticket-1' }) },
    );
    const second = await assignTicketRoute(
      makeAssignRequest(url, token, body, 'assign-retry-1'),
      { params: Promise.resolve({ ticketId: 'ticket-1' }) },
    );

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const firstJson = await first.json() as { ticket: { assignedPartyChiefId: string } };
    const secondJson = await second.json() as { ticket: { assignedPartyChiefId: string } };
    assert.equal(firstJson.ticket.assignedPartyChiefId, 'pc-2');
    assert.equal(secondJson.ticket.assignedPartyChiefId, 'pc-2');
    assert.equal(patchCalls, 1);
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    TicketRepository.prototype.findById = originalFindById;
    TicketRepository.prototype.patchTicket = originalPatchTicket;
  }
});
