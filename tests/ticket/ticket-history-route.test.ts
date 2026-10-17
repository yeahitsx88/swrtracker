import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { handleGetTicketHistory, type TicketHistoryRouteDeps } from '@/app/api/tickets/[ticketId]/history/handler';
import { listTicketHistory, sanitizeHistoryDetails } from '@/modules/ticket/infrastructure/ticket-history.repository';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const actorId = 'requester-1' as UUID;

const visibility: VisibilityScope = {
  actorId,
  actorRole: 'REQUESTER',
  projectId,
  companyId: 'company-1' as UUID,
  companyType: 'SUBCONTRACTOR',
};

function makeRequest() {
  return new NextRequest(`http://localhost/api/tickets/${ticketId}/history`);
}

function makeDeps(visible: boolean, calls: Array<[string, string]>): TicketHistoryRouteDeps {
  return {
    getTicketRouteContext: async () => ({
      tenantId, projectId, ticketId, actorId, actorRole: 'REQUESTER', visibility,
    }),
    createTicketRepo: () => ({
      findById: async () => visible ? ({ id: ticketId } as Ticket) : null,
    } as unknown as ITicketRepository),
    listHistory: async (tenant, ticket) => {
      calls.push([tenant, ticket]);
      return [{
        id: 'event-1', source: 'TICKET_EVENT', type: 'ticket.created',
        occurredAt: '2026-09-24T12:00:00.000Z',
        actor: { id: actorId, name: 'Requester' }, details: {},
      }];
    },
  };
}

test('history route checks ticket visibility before reading tenant-scoped history', async () => {
  const calls: Array<[string, string]> = [];
  const response = await handleGetTicketHistory(
    makeRequest(),
    { params: Promise.resolve({ ticketId }) },
    makeDeps(true, calls),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [[tenantId, ticketId]]);
  assert.equal((await response.json()).history[0].type, 'ticket.created');
});

test('history route returns 404 and does not query history for a hidden ticket', async () => {
  const calls: Array<[string, string]> = [];
  const response = await handleGetTicketHistory(
    makeRequest(),
    { params: Promise.resolve({ ticketId }) },
    makeDeps(false, calls),
  );
  assert.equal(response.status, 404);
  assert.deepEqual(calls, []);
});

test('history detail sanitization removes storage, recipient, email, and idempotency fields recursively', () => {
  assert.deepEqual(sanitizeHistoryDetails({
    filename: 'drawing.pdf',
    storageKey: 'secret/path',
    recipientUserId: 'other-user',
    nested: { recipient_email: 'private@example.com', ok: true },
    idempotency_key: 'secret-key',
  }), {
    filename: 'drawing.pdf',
    nested: { ok: true },
  });
});

test('history repository maps rows in database order and never exposes private details', async () => {
  let queryParams: unknown[] | undefined;
  const db = {
    query: async (_sql: string, params?: unknown[]) => {
      queryParams = params;
      return { rows: [
        {
          id: 'notification-1', source: 'NOTIFICATION', type: 'ASSIGNED',
          occurred_at: '2026-09-24T13:00:00Z', actor_id: null, actor_name: null,
          details: { deliveryState: 'CAPTURED', recipientUserId: 'hidden' },
        },
        {
          id: 'event-1', source: 'TICKET_EVENT', type: 'attachment.downloaded',
          occurred_at: '2026-09-24T12:00:00Z', actor_id: actorId, actor_name: 'Requester',
          details: { filename: 'drawing.pdf', storage_key: 'hidden' },
        },
      ] };
    },
  } as unknown as DbClient;

  const history = await listTicketHistory(db, tenantId, ticketId);
  assert.deepEqual(queryParams, [tenantId, ticketId]);
  assert.deepEqual(history.map((item) => item.id), ['notification-1', 'event-1']);
  assert.deepEqual(history[0]?.details, { deliveryState: 'CAPTURED' });
  assert.deepEqual(history[1]?.details, { filename: 'drawing.pdf' });
  assert.equal(history[1]?.actor?.name, 'Requester');
});
