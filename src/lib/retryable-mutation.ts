import { createIdempotencyKey } from './apiClient';
import { ApiClientError } from './errors';

/** Retain the exact command/key across an uncertain response, never silently rebase it. */
export class RetryableMutation<T> {
  pending: { input: T; key: string } | null = null;
  async run<R>(input: T, send: (input: T, key: string) => Promise<R>): Promise<R> {
    if (this.pending && JSON.stringify(this.pending.input) !== JSON.stringify(input)) {
      throw new Error('Retry the unconfirmed action before changing its fields. Your entered data is retained.');
    }
    const attempt = this.pending ?? { input: structuredClone(input), key: createIdempotencyKey() };
    this.pending = attempt;
    try { const result = await send(attempt.input, attempt.key); this.pending = null; return result; }
    catch (error) {
      if (error instanceof ApiClientError && error.status < 500 && error.status !== 408 && error.code !== 'IDEMPOTENCY_IN_PROGRESS') this.pending = null;
      throw error;
    }
  }
}
