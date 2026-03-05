import { createHash } from 'crypto';
import { ConflictError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { logInfo } from './observability';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

interface IdempotencyRow {
  request_hash: string;
  response_status: number | null;
  response_body: unknown;
}

export interface IdempotencyScope {
  tenantId: UUID;
  actorId: UUID;
  endpoint: string;
  idempotencyKey: string;
}

export interface IdempotentHttpResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b));
  const serialized = entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',');
  return `{${serialized}}`;
}

function buildRequestHash(payload: unknown): string {
  return createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex');
}

function parseReplayBody<T>(value: unknown): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value as T;
}

export function requireIdempotencyKey(req: { headers: Headers }): string {
  const key = req.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (!key) {
    throw new ValidationError(
      'Idempotency-Key header is required',
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  }

  const normalized = key.trim();
  if (normalized.length === 0 || normalized.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new ValidationError(
      `Idempotency-Key must be 1-${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
      'IDEMPOTENCY_KEY_INVALID',
    );
  }
  return normalized;
}

export async function executeIdempotentHttpMutation<T>(
  db: DbClient,
  scope: IdempotencyScope,
  requestPayload: unknown,
  mutation: () => Promise<{ status: number; body: T }>,
): Promise<IdempotentHttpResult<T>> {
  const requestHash = buildRequestHash(requestPayload);
  const scopedParams = [
    scope.tenantId,
    scope.actorId,
    scope.endpoint,
    scope.idempotencyKey,
  ];

  const insertResult = await db.query(
    `INSERT INTO api_idempotency (
       tenant_id,
       actor_id,
       endpoint,
       idempotency_key,
       request_hash
     )
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, actor_id, endpoint, idempotency_key) DO NOTHING
     RETURNING idempotency_key`,
    [...scopedParams, requestHash],
  );

  if (!insertResult.rows[0]) {
    const existing = await db.query<IdempotencyRow>(
      `SELECT request_hash, response_status, response_body
       FROM api_idempotency
       WHERE tenant_id = $1
         AND actor_id = $2
         AND endpoint = $3
         AND idempotency_key = $4
       FOR UPDATE`,
      scopedParams,
    );
    const row = existing.rows[0];
    if (!row) {
      logInfo('Idempotency lookup miss after collision', {
        eventType: 'idempotency.in_progress',
        tenantId: scope.tenantId,
        actorId: scope.actorId,
        endpoint: scope.endpoint,
      });
      throw new ConflictError(
        'Idempotent request could not be resolved. Retry your request.',
        'IDEMPOTENCY_IN_PROGRESS',
      );
    }
    if (row.request_hash !== requestHash) {
      logInfo('Idempotency key payload mismatch', {
        eventType: 'idempotency.mismatch',
        tenantId: scope.tenantId,
        actorId: scope.actorId,
        endpoint: scope.endpoint,
      });
      throw new ConflictError(
        'Idempotency key cannot be reused with a different request payload.',
        'IDEMPOTENCY_KEY_REUSE_MISMATCH',
      );
    }
    if (row.response_status === null) {
      logInfo('Idempotent request still in progress', {
        eventType: 'idempotency.in_progress',
        tenantId: scope.tenantId,
        actorId: scope.actorId,
        endpoint: scope.endpoint,
      });
      throw new ConflictError(
        'A request with this idempotency key is still processing.',
        'IDEMPOTENCY_IN_PROGRESS',
      );
    }

    logInfo('Idempotent response replayed', {
      eventType: 'idempotency.replay',
      tenantId: scope.tenantId,
      actorId: scope.actorId,
      endpoint: scope.endpoint,
    });

    return {
      status: row.response_status,
      body: parseReplayBody<T>(row.response_body),
      replayed: true,
    };
  }

  const result = await mutation();
  await db.query(
    `UPDATE api_idempotency
     SET response_status = $5,
         response_body = $6::jsonb,
         updated_at = NOW()
     WHERE tenant_id = $1
       AND actor_id = $2
       AND endpoint = $3
       AND idempotency_key = $4`,
    [
      ...scopedParams,
      result.status,
      JSON.stringify(result.body),
    ],
  );

  return {
    status: result.status,
    body: result.body,
    replayed: false,
  };
}
