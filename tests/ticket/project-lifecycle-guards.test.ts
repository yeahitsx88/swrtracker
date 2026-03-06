import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ConflictError } from '@/shared/errors';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import { POST as createTicketRoute } from '@/app/api/tickets/route';
import { signToken, COOKIE_NAME } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';

type JsonObject = Record<string, unknown>;
type PoolLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  connect: () => Promise<{
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    release: () => void;
  }>;
};

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const requesterId = 'requester-1' as UUID;

function makeDraftTicket(overrides?: Partial<Ticket>): Ticket {
  const now = new Date('2026-03-04T12:00:00Z');

  return {
    id: ticketId,
    tenantId,
    projectId,
    aorNodeId: 'aor-node-1' as UUID,
    departmentId: null,
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
    description: 'Lifecycle guard test ticket',
    requestedDate: new Date(Date.now() + (72 * 60 * 60 * 1000)),
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
    findByIdInternal: async () => makeDraftTicket(),
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
    findUserCompanyInfo: async () => ({
      companyId: 'company-1' as UUID,
      companyType: 'GC',
    }),
    findUserEmail: async () => 'requester@example.com',
    findPartyChiefForInstrumentMan: async () => null,
    findAorNodeIdsForUser: async () => [],
    findProjectLeadTimeConfig: async () => ({
      enforcementEnabled: true,
      leadTimeDays: 2,
    }),
    ...overrides,
  };
}

function makeRequest(token: string, body: JsonObject): NextRequest {
  return new NextRequest('http://localhost/api/tickets', {
    method: 'POST',
    headers: {
      cookie: `${COOKIE_NAME}=${token}`,
      'content-type': 'application/json',
      'idempotency-key': 'project-lifecycle-idempotency-key',
    },
    body: JSON.stringify(body),
  });
}

const db: DbClient = {
  query: async () => ({ rows: [] }),
};

test('createTicket rejects archived projects', async () => {
  const repo = makeRepo({
    findProjectStatus: async () => 'ARCHIVED',
  });

  await assert.rejects(
    () => createTicket(repo, db, {
      tenantId,
      projectId,
      aorNodeId: 'aor-node-1' as UUID,
      companyId: 'company-1' as UUID,
      requesterId,
      ticketType: 'LAYOUT',
      workflowVariant: 'STANDARD_APPROVAL',
      craft: 'Civil',
      description: 'Needs layout',
      requestedDate: new Date(Date.now() + (72 * 60 * 60 * 1000)),
    }),
    ConflictError,
  );
});

test('submitTicket rejects submissions while the project is in SETUP', async () => {
  const repo = makeRepo({
    findProjectStatus: async () => 'SETUP',
  });

  await assert.rejects(
    () => submitTicket(repo, db, {
      tenantId,
      ticketId,
      actorId: requesterId,
      actorRole: 'REQUESTER',
    }),
    ConflictError,
  );
});

test('submitTicket rejects submissions on archived projects', async () => {
  const repo = makeRepo({
    findProjectStatus: async () => 'ARCHIVED',
  });

  await assert.rejects(
    () => submitTicket(repo, db, {
      tenantId,
      ticketId,
      actorId: requesterId,
      actorRole: 'REQUESTER',
    }),
    ConflictError,
  );
});

test('POST /api/tickets blocks direct-assignment creation while the project is in SETUP', async () => {
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.DATABASE_URL ??= 'postgres://local/test';

  const managerId = 'manager-1' as UUID;
  const pool = getPool() as unknown as PoolLike;
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const originalFindProjectStatus = TicketRepository.prototype.findProjectStatus;
  const idempotencyRows = new Map<string, {
    requestHash: string;
    responseStatus: number | null;
    responseBody: unknown;
  }>();

  pool.query = async (sql: string, params?: unknown[]) => {
    if (/FROM users/.test(sql)) {
      return { rows: [{ session_version: 1, deactivated_at: null }] };
    }
    if (/SELECT role\s+FROM project_memberships/.test(sql)) {
      return { rows: [{ role: params?.[1] === managerId ? 'SURVEY_MANAGER' : 'REQUESTER' }] };
    }
    return { rows: [] };
  };
  pool.connect = async () => ({
    query: async (sql: string, params?: unknown[]) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) {
        return { rows: [] };
      }
      if (/INSERT INTO api_idempotency/.test(sql)) {
        const key = `${params?.[0]}|${params?.[1]}|${params?.[2]}|${params?.[3]}`;
        if (idempotencyRows.has(key)) {
          return { rows: [] };
        }
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
        const row = idempotencyRows.get(key);
        if (row) {
          row.responseStatus = params?.[4] as number;
          row.responseBody = JSON.parse(params?.[5] as string);
          idempotencyRows.set(key, row);
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
    release: () => undefined,
  });
  TicketRepository.prototype.findProjectStatus = async () => 'SETUP';

  try {
    const response = await createTicketRoute(makeRequest(signToken(managerId, tenantId), {
      projectId,
      aorNodeId: 'aor-node-1',
      workflowVariant: 'DIRECT_ASSIGNMENT',
      requesterId,
      assignedPartyChiefId: 'pc-1',
      ticketType: 'LAYOUT',
      craft: 'Civil',
      fieldContact: 'Foreman A',
      fieldChannel: 'CH-11',
      description: 'Urgent direct assignment',
      requestedDate: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
    }));

    assert.equal(response.status, 409);
    const json = await response.json() as { error: { message: string } };
    assert.equal(json.error.message, 'Tickets cannot be submitted while the project is in SETUP');
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    TicketRepository.prototype.findProjectStatus = originalFindProjectStatus;
  }
});

test('POST /api/tickets blocks requester draft creation on archived projects', async () => {
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.DATABASE_URL ??= 'postgres://local/test';

  const pool = getPool() as unknown as PoolLike;
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const originalFindProjectStatus = TicketRepository.prototype.findProjectStatus;
  const idempotencyRows = new Map<string, {
    requestHash: string;
    responseStatus: number | null;
    responseBody: unknown;
  }>();

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
    query: async (sql: string, params?: unknown[]) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) {
        return { rows: [] };
      }
      if (/INSERT INTO api_idempotency/.test(sql)) {
        const key = `${params?.[0]}|${params?.[1]}|${params?.[2]}|${params?.[3]}`;
        if (idempotencyRows.has(key)) {
          return { rows: [] };
        }
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
        const row = idempotencyRows.get(key);
        if (row) {
          row.responseStatus = params?.[4] as number;
          row.responseBody = JSON.parse(params?.[5] as string);
          idempotencyRows.set(key, row);
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
    release: () => undefined,
  });
  TicketRepository.prototype.findProjectStatus = async () => 'ARCHIVED';

  try {
    const response = await createTicketRoute(makeRequest(signToken(requesterId, tenantId), {
      projectId,
      aorNodeId: 'aor-node-1',
      ticketType: 'LAYOUT',
      craft: 'Civil',
      fieldContact: 'Foreman A',
      fieldChannel: 'CH-11',
      description: 'Requester draft',
      requestedDate: new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString(),
    }));

    assert.equal(response.status, 409);
    const json = await response.json() as { error: { message: string } };
    assert.equal(json.error.message, 'Archived projects are read-only');
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    TicketRepository.prototype.findProjectStatus = originalFindProjectStatus;
  }
});
