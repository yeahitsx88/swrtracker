import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictError, ValidationError } from '@/shared/errors';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import type { DbClient, UUID } from '@/shared/types';

interface StoredRow {
  requestHash: string;
  responseStatus: number | null;
  responseBody: unknown;
}

class MemoryIdempotencyDb implements DbClient {
  private readonly rows = new Map<string, StoredRow>();

  seed(
    key: string,
    row: StoredRow,
  ): void {
    this.rows.set(key, row);
  }

  markInProgress(key: string): void {
    const row = this.rows.get(key);
    if (!row) return;
    row.responseStatus = null;
    row.responseBody = null;
    this.rows.set(key, row);
  }

  async query<T extends object = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    if (sql.includes('INSERT INTO api_idempotency')) {
      const key = this.buildKey(params);
      if (this.rows.has(key)) {
        return { rows: [] as T[] };
      }
      this.rows.set(key, {
        requestHash: params[4] as string,
        responseStatus: null,
        responseBody: null,
      });
      return { rows: [{ idempotency_key: params[3] } as T] };
    }

    if (sql.includes('SELECT request_hash, response_status, response_body')) {
      const key = this.buildKey(params);
      const row = this.rows.get(key);
      if (!row) return { rows: [] as T[] };
      return {
        rows: [{
          request_hash: row.requestHash,
          response_status: row.responseStatus,
          response_body: row.responseBody,
        } as T],
      };
    }

    if (sql.includes('UPDATE api_idempotency')) {
      const key = this.buildKey(params);
      const row = this.rows.get(key);
      if (!row) return { rows: [] as T[] };
      row.responseStatus = params[4] as number;
      row.responseBody = JSON.parse(params[5] as string);
      this.rows.set(key, row);
      return { rows: [] as T[] };
    }

    return { rows: [] as T[] };
  }

  private buildKey(params: unknown[]): string {
    return `${params[0]}|${params[1]}|${params[2]}|${params[3]}`;
  }
}

test('executeIdempotentHttpMutation replays cached success and suppresses duplicate mutation', async () => {
  const db = new MemoryIdempotencyDb();
  let mutationCalls = 0;
  const scope = {
    tenantId: 'tenant-1' as UUID,
    actorId: 'user-1' as UUID,
    endpoint: 'POST:/api/tickets',
    idempotencyKey: 'create-ticket-key',
  };
  const payload = { projectId: 'project-1', aorNodeId: 'aor-1' };

  const first = await executeIdempotentHttpMutation(
    db,
    scope,
    payload,
    async () => {
      mutationCalls += 1;
      return {
        status: 201,
        body: { ticket: { id: 'ticket-1', status: 'DRAFT' } },
      };
    },
  );
  const second = await executeIdempotentHttpMutation(
    db,
    scope,
    payload,
    async () => {
      mutationCalls += 1;
      return {
        status: 201,
        body: { ticket: { id: 'ticket-2', status: 'DRAFT' } },
      };
    },
  );

  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(mutationCalls, 1);
  assert.deepEqual(second.body, first.body);
});

test('executeIdempotentHttpMutation rejects same-key different-payload reuse', async () => {
  const db = new MemoryIdempotencyDb();
  const scope = {
    tenantId: 'tenant-1' as UUID,
    actorId: 'user-1' as UUID,
    endpoint: 'POST:/api/tickets/ticket-1/assign',
    idempotencyKey: 'assign-key',
  };

  await executeIdempotentHttpMutation(
    db,
    scope,
    { assignedPartyChiefId: 'pc-1' },
    async () => ({
      status: 200,
      body: { ticket: { id: 'ticket-1', assignedPartyChiefId: 'pc-1' } },
    }),
  );

  await assert.rejects(
    () => executeIdempotentHttpMutation(
      db,
      scope,
      { assignedPartyChiefId: 'pc-2' },
      async () => ({
        status: 200,
        body: { ticket: { id: 'ticket-1', assignedPartyChiefId: 'pc-2' } },
      }),
    ),
    (err: unknown) =>
      err instanceof ConflictError &&
      err.code === 'IDEMPOTENCY_KEY_REUSE_MISMATCH',
  );
});

test('executeIdempotentHttpMutation rejects keys still marked in-progress', async () => {
  const db = new MemoryIdempotencyDb();
  const scope = {
    tenantId: 'tenant-1' as UUID,
    actorId: 'user-1' as UUID,
    endpoint: 'POST:/api/tickets/ticket-1/requester-cancel',
    idempotencyKey: 'cancel-key',
  };

  const payload = { ticketId: 'ticket-1' };
  await executeIdempotentHttpMutation(
    db,
    scope,
    payload,
    async () => ({
      status: 200,
      body: { ticket: { id: 'ticket-1', status: 'REQUESTER_CANCELED' } },
    }),
  );

  db.markInProgress(
    `${scope.tenantId}|${scope.actorId}|${scope.endpoint}|${scope.idempotencyKey}`,
  );

  await assert.rejects(
    () => executeIdempotentHttpMutation(
      db,
      scope,
      payload,
      async () => ({
        status: 200,
        body: { ticket: { id: 'ticket-1', status: 'REQUESTER_CANCELED' } },
      }),
    ),
    (err: unknown) =>
      err instanceof ConflictError &&
      err.code === 'IDEMPOTENCY_IN_PROGRESS',
  );
});

test('requireIdempotencyKey validates header presence and length', async () => {
  await assert.rejects(
    async () => requireIdempotencyKey({ headers: new Headers() }),
    (err: unknown) =>
      err instanceof ValidationError &&
      err.code === 'IDEMPOTENCY_KEY_REQUIRED',
  );

  const tooLong = 'x'.repeat(129);
  await assert.rejects(
    async () => requireIdempotencyKey({
      headers: new Headers({ 'idempotency-key': tooLong }),
    }),
    (err: unknown) =>
      err instanceof ValidationError &&
      err.code === 'IDEMPOTENCY_KEY_INVALID',
  );
});
