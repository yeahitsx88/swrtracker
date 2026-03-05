import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

const CORRELATION_HEADER = 'x-correlation-id';
const store = new AsyncLocalStorage<{ correlationId: string }>();

function sanitizeCorrelationId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) {
    return trimmed.slice(0, 128);
  }
  return trimmed;
}

export function getCorrelationId(): string | null {
  return store.getStore()?.correlationId ?? null;
}

export function resolveCorrelationId(req?: { headers: Headers }): string {
  const fromHeader = req?.headers?.get(CORRELATION_HEADER) ?? null;
  return sanitizeCorrelationId(fromHeader) ?? randomUUID();
}

export async function runWithCorrelationId<T>(
  correlationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return await store.run({ correlationId }, fn);
}

export async function withRequestCorrelation(
  req: { headers: Headers },
  fn: () => Promise<Response>,
): Promise<Response> {
  const correlationId = resolveCorrelationId(req);
  return await runWithCorrelationId(correlationId, async () => {
    const response = await fn();
    response.headers.set(CORRELATION_HEADER, correlationId);
    return response;
  });
}
