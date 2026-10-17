import { RateLimitError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

export interface LoginRateLimitScope {
  tenantId: UUID;
  email: string;
}

export interface LoginRateLimitPolicy {
  maxFailedAttempts: number;
  attemptWindowSeconds: number;
  blockDurationSeconds: number;
}

export interface LoginRateLimitState {
  failedAttempts: number;
  blockedUntil: Date | null;
}

export interface ILoginRateLimitRepository {
  findActiveBlock(
    db: DbClient,
    scope: LoginRateLimitScope,
  ): Promise<Date | null>;
  recordFailure(
    db: DbClient,
    scope: LoginRateLimitScope,
    policy: LoginRateLimitPolicy,
  ): Promise<LoginRateLimitState>;
  clearFailures(
    db: DbClient,
    scope: LoginRateLimitScope,
  ): Promise<void>;
}

export interface LoginRateLimiter {
  assertCanAttempt(db: DbClient, scope: LoginRateLimitScope): Promise<void>;
  recordFailure(db: DbClient, scope: LoginRateLimitScope): Promise<void>;
  clearFailures(db: DbClient, scope: LoginRateLimitScope): Promise<void>;
}

export const DEFAULT_LOGIN_RATE_LIMIT_POLICY: LoginRateLimitPolicy = {
  maxFailedAttempts: 5,
  attemptWindowSeconds: 15 * 60,
  blockDurationSeconds: 15 * 60,
};

const RATE_LIMIT_MESSAGE = 'Too many login attempts. Try again later.';
const RATE_LIMIT_CODE = 'AUTH_RATE_LIMITED';

export function createLoginRateLimiter(
  repo: ILoginRateLimitRepository,
  policy: LoginRateLimitPolicy = DEFAULT_LOGIN_RATE_LIMIT_POLICY,
): LoginRateLimiter {
  return {
    async assertCanAttempt(db, scope) {
      const blockedUntil = await repo.findActiveBlock(db, scope);
      if (blockedUntil) {
        throw new RateLimitError(RATE_LIMIT_MESSAGE, RATE_LIMIT_CODE);
      }
    },
    async recordFailure(db, scope) {
      const state = await repo.recordFailure(db, scope, policy);
      if (state.blockedUntil) {
        throw new RateLimitError(RATE_LIMIT_MESSAGE, RATE_LIMIT_CODE);
      }
    },
    async clearFailures(db, scope) {
      await repo.clearFailures(db, scope);
    },
  };
}
