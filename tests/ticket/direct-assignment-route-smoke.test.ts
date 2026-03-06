import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { signToken, COOKIE_NAME } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { UUID } from '@/shared/types';
import { POST as createTicketRoute } from '@/app/api/tickets/route';
import { POST as assignTicketRoute } from '@/app/api/tickets/[ticketId]/assign/route';
import { POST as startTicketRoute } from '@/app/api/tickets/[ticketId]/start/route';
import { POST as fieldCancelRoute } from '@/app/api/tickets/[ticketId]/field-cancel/route';
import { POST as approvePcRoute } from '@/app/api/tickets/[ticketId]/pc-approve/route';

type JsonObject = Record<string, unknown>;
type PoolLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  connect: () => Promise<{
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    release: () => void;
  }>;
};

function makeRequest(
  url: string,
  token: string,
  body?: JsonObject,
  idempotencyKey = 'test-idempotency-key',
): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      cookie: `${COOKIE_NAME}=${token}`,
      'idempotency-key': idempotencyKey,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function readJson(response: Response): Promise<JsonObject> {
  return await response.json() as JsonObject;
}

test('direct-assignment tickets move through create, assign, start, field-cancel, and pc-approve routes', async () => {
  process.env.JWT_SECRET ??= 'test-secret';
  process.env.DATABASE_URL ??= 'postgres://local/test';

  const tenantId = 'tenant-1' as UUID;
  const projectId = 'project-1' as UUID;
  const aorNodeId = 'aor-node-1' as UUID;
  const departmentId = 'department-1' as UUID;
  const requesterId = 'requester-1' as UUID;
  const managerId = 'manager-1' as UUID;
  const firstPcId = 'pc-1' as UUID;
  const secondPcId = 'pc-2' as UUID;
  const instrumentManId = 'im-1' as UUID;

  const actorRoles = new Map<string, string>([
    [managerId, 'SURVEY_MANAGER'],
    [requesterId, 'REQUESTER'],
    [firstPcId, 'PARTY_CHIEF'],
    [secondPcId, 'PARTY_CHIEF'],
    [instrumentManId, 'INSTRUMENT_MAN'],
  ]);

  let currentTicket: Ticket | null = null;
  let nextSequence = 7;
  const idempotencyRows = new Map<string, {
    requestHash: string;
    responseStatus: number | null;
    responseBody: unknown;
  }>();

  const pool = getPool() as unknown as PoolLike;
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const originalFindUserCompanyInfo = TicketRepository.prototype.findUserCompanyInfo;
  const originalFindAorNodeCode = TicketRepository.prototype.findAorNodeCode;
  const originalFindRequesterDepartmentMembership = TicketRepository.prototype.findRequesterDepartmentMembership;
  const originalFindDepartmentTitlePriority = TicketRepository.prototype.findDepartmentTitlePriority;
  const originalFindDepartmentById = TicketRepository.prototype.findDepartmentById;
  const originalFindUserEmail = TicketRepository.prototype.findUserEmail;
  const originalIsEmailWhitelisted = TicketRepository.prototype.isEmailWhitelisted;
  const originalFindProjectStatus = TicketRepository.prototype.findProjectStatus;
  const originalNextSequence = TicketRepository.prototype.nextSequence;
  const originalSave = TicketRepository.prototype.save;
  const originalSaveCadWork = TicketRepository.prototype.saveCadWork;
  const originalFindById = TicketRepository.prototype.findById;
  const originalFindByIdInternal = TicketRepository.prototype.findByIdInternal;
  const originalPatchTicket = TicketRepository.prototype.patchTicket;
  const originalFindPartyChiefForInstrumentMan = TicketRepository.prototype.findPartyChiefForInstrumentMan;

  pool.query = async (sql: string, params?: unknown[]) => {
    if (/FROM users/.test(sql)) {
      return { rows: [{ session_version: 1, deactivated_at: null }] };
    }
    if (/SELECT project_id FROM tickets/.test(sql)) {
      return { rows: currentTicket ? [{ project_id: currentTicket.projectId }] : [] };
    }
    if (/SELECT role\s+FROM project_memberships/.test(sql)) {
      const userId = params?.[1] as string;
      const role = actorRoles.get(userId);
      return { rows: role ? [{ role }] : [] };
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

  TicketRepository.prototype.findUserCompanyInfo = async (_db, _tenantId, userId) => ({
    companyId: userId === requesterId ? ('requester-company' as UUID) : ('gc-company' as UUID),
    companyType: 'GC',
  });
  TicketRepository.prototype.findAorNodeCode = async () => 'U1';
  TicketRepository.prototype.findRequesterDepartmentMembership = async (_db, _tenantId, _projectId, userId) =>
    userId === requesterId ? { departmentId, title: 'QA Manager' } : null;
  TicketRepository.prototype.findDepartmentTitlePriority = async () => 'MED_HIGH';
  TicketRepository.prototype.findDepartmentById = async () => ({ id: departmentId });
  TicketRepository.prototype.findUserEmail = async (_db, _tenantId, userId) =>
    userId === requesterId ? 'requester@example.com' : `${userId}@example.com`;
  TicketRepository.prototype.isEmailWhitelisted = async () => false;
  TicketRepository.prototype.findProjectStatus = async () => 'ACTIVE';
  TicketRepository.prototype.nextSequence = async () => nextSequence++;
  TicketRepository.prototype.save = async (_db, ticket) => {
    currentTicket = ticket;
  };
  TicketRepository.prototype.saveCadWork = async () => undefined;
  TicketRepository.prototype.findById = async () => currentTicket;
  TicketRepository.prototype.findByIdInternal = async () => currentTicket;
  TicketRepository.prototype.patchTicket = async (_db, _tenantId, _ticketId, patch) => {
    if (!currentTicket) return;
    currentTicket = {
      ...currentTicket,
      ...patch,
      updatedAt: new Date(),
    };
  };
  TicketRepository.prototype.findPartyChiefForInstrumentMan = async () => secondPcId;

  try {
    const managerToken = signToken(managerId, tenantId);
    const secondPcToken = signToken(secondPcId, tenantId);
    const instrumentManToken = signToken(instrumentManId, tenantId);

    const createResponse = await createTicketRoute(makeRequest('http://localhost/api/tickets', managerToken, {
      projectId,
      aorNodeId,
      workflowVariant: 'DIRECT_ASSIGNMENT',
      requesterId,
      assignedPartyChiefId: firstPcId,
      assignedInstrumentManId: instrumentManId,
      ticketType: 'LAYOUT',
      craft: 'Civil',
      fieldContact: 'Foreman A',
      fieldChannel: 'CH-11',
      description: 'Urgent direct assignment',
      requestedDate: new Date(Date.now() + (60 * 60 * 1000)).toISOString(),
    }, 'idem-create-1'));
    assert.equal(createResponse.status, 201);
    const created = await readJson(createResponse);
    const ticketId = (created.ticket as JsonObject).id as string;
    assert.equal((created.ticket as JsonObject).status, 'ASSIGNED');

    const assignResponse = await assignTicketRoute(
      makeRequest(`http://localhost/api/tickets/${ticketId}/assign`, managerToken, {
        assignedPartyChiefId: secondPcId,
        assignedInstrumentManId: instrumentManId,
      }, 'idem-assign-1'),
      { params: Promise.resolve({ ticketId }) },
    );
    assert.equal(assignResponse.status, 200);
    const reassigned = await readJson(assignResponse);
    assert.equal((reassigned.ticket as JsonObject).assignedPartyChiefId, secondPcId);

    const startResponse = await startTicketRoute(
      makeRequest(`http://localhost/api/tickets/${ticketId}/start`, secondPcToken),
      { params: Promise.resolve({ ticketId }) },
    );
    assert.equal(startResponse.status, 200);
    const started = await readJson(startResponse);
    assert.equal((started.ticket as JsonObject).status, 'IN_PROGRESS');

    const fieldCancelResponse = await fieldCancelRoute(
      makeRequest(`http://localhost/api/tickets/${ticketId}/field-cancel`, instrumentManToken, {
        reason: 'Unsafe conditions',
      }, 'idem-field-cancel-1'),
      { params: Promise.resolve({ ticketId }) },
    );
    assert.equal(fieldCancelResponse.status, 200);
    const pending = await readJson(fieldCancelResponse);
    assert.equal((pending.ticket as JsonObject).status, 'PENDING_PC_APPROVAL');

    const approveResponse = await approvePcRoute(
      makeRequest(`http://localhost/api/tickets/${ticketId}/pc-approve`, secondPcToken),
      { params: Promise.resolve({ ticketId }) },
    );
    assert.equal(approveResponse.status, 200);
    const canceled = await readJson(approveResponse);
    assert.equal((canceled.ticket as JsonObject).status, 'FIELD_CANCELED');
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    TicketRepository.prototype.findUserCompanyInfo = originalFindUserCompanyInfo;
    TicketRepository.prototype.findAorNodeCode = originalFindAorNodeCode;
    TicketRepository.prototype.findRequesterDepartmentMembership = originalFindRequesterDepartmentMembership;
    TicketRepository.prototype.findDepartmentTitlePriority = originalFindDepartmentTitlePriority;
    TicketRepository.prototype.findDepartmentById = originalFindDepartmentById;
    TicketRepository.prototype.findUserEmail = originalFindUserEmail;
    TicketRepository.prototype.isEmailWhitelisted = originalIsEmailWhitelisted;
    TicketRepository.prototype.findProjectStatus = originalFindProjectStatus;
    TicketRepository.prototype.nextSequence = originalNextSequence;
    TicketRepository.prototype.save = originalSave;
    TicketRepository.prototype.saveCadWork = originalSaveCadWork;
    TicketRepository.prototype.findById = originalFindById;
    TicketRepository.prototype.findByIdInternal = originalFindByIdInternal;
    TicketRepository.prototype.patchTicket = originalPatchTicket;
    TicketRepository.prototype.findPartyChiefForInstrumentMan = originalFindPartyChiefForInstrumentMan;
  }
});
