import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimitError } from '@/shared/errors';
import {
  createLoginRateLimiter,
  DEFAULT_LOGIN_RATE_LIMIT_POLICY,
  type ILoginRateLimitRepository,
} from '@/modules/identity/application/login-rate-limit';
import type { DbClient, UUID } from '@/shared/types';

const db: DbClient = { query: async () => ({ rows: [] }) };
const scope = {
  tenantId: 'tenant-1' as UUID,
  email: 'field.user@example.com',
};

function createRepo(overrides?: Partial<ILoginRateLimitRepository>): ILoginRateLimitRepository {
  return {
    findActiveBlock: async () => null,
    recordFailure: async () => ({ failedAttempts: 1, blockedUntil: null }),
    clearFailures: async () => undefined,
    ...overrides,
  };
}

test('createLoginRateLimiter.assertCanAttempt throws when active block exists', async () => {
  const limiter = createLoginRateLimiter(
    createRepo({
      findActiveBlock: async () => new Date('2026-03-05T13:00:00Z'),
    }),
  );

  await assert.rejects(
    limiter.assertCanAttempt(db, scope),
    (err: unknown) => {
      assert.ok(err instanceof RateLimitError);
      assert.equal(err.code, 'AUTH_RATE_LIMITED');
      return true;
    },
  );
});

test('createLoginRateLimiter.recordFailure enforces lock when threshold is reached', async () => {
  const limiter = createLoginRateLimiter(
    createRepo({
      recordFailure: async (_db, _scope, policy) => {
        assert.equal(policy.maxFailedAttempts, DEFAULT_LOGIN_RATE_LIMIT_POLICY.maxFailedAttempts);
        return {
          failedAttempts: policy.maxFailedAttempts,
          blockedUntil: new Date('2026-03-05T13:05:00Z'),
        };
      },
    }),
  );

  await assert.rejects(
    limiter.recordFailure(db, scope),
    (err: unknown) => {
      assert.ok(err instanceof RateLimitError);
      assert.equal(err.code, 'AUTH_RATE_LIMITED');
      return true;
    },
  );
});

test('createLoginRateLimiter.clearFailures delegates to repository', async () => {
  let cleared = false;
  const limiter = createLoginRateLimiter(
    createRepo({
      clearFailures: async () => {
        cleared = true;
      },
    }),
  );

  await limiter.clearFailures(db, scope);
  assert.equal(cleared, true);
});
