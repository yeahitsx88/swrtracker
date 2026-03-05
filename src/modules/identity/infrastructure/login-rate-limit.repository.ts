import type {
  ILoginRateLimitRepository,
  LoginRateLimitPolicy,
  LoginRateLimitScope,
  LoginRateLimitState,
} from '@/modules/identity/application/login-rate-limit';
import type { DbClient } from '@/shared/types';

function parseDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export class LoginRateLimitRepository implements ILoginRateLimitRepository {
  async findActiveBlock(
    db: DbClient,
    scope: LoginRateLimitScope,
  ): Promise<Date | null> {
    const { rows } = await db.query<{ blocked_until: string | Date | null }>(
      `
        SELECT blocked_until
        FROM auth_login_rate_limits
        WHERE tenant_id = $1
          AND email = $2
          AND blocked_until IS NOT NULL
          AND blocked_until > NOW()
      `,
      [scope.tenantId, scope.email],
    );

    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    if (!row) {
      return null;
    }
    return parseDate(row.blocked_until);
  }

  async recordFailure(
    db: DbClient,
    scope: LoginRateLimitScope,
    policy: LoginRateLimitPolicy,
  ): Promise<LoginRateLimitState> {
    const { rows } = await db.query<{ failed_attempts: number; blocked_until: string | Date | null }>(
      `
        INSERT INTO auth_login_rate_limits (
          tenant_id,
          email,
          failed_attempts,
          first_failed_at,
          last_failed_at,
          blocked_until,
          updated_at
        )
        VALUES ($1, $2, 1, NOW(), NOW(), NULL, NOW())
        ON CONFLICT (tenant_id, email) DO UPDATE SET
          failed_attempts = CASE
            WHEN auth_login_rate_limits.blocked_until IS NOT NULL
              AND auth_login_rate_limits.blocked_until > NOW()
              THEN auth_login_rate_limits.failed_attempts
            WHEN auth_login_rate_limits.first_failed_at <= NOW() - make_interval(secs => $3::int)
              THEN 1
            ELSE auth_login_rate_limits.failed_attempts + 1
          END,
          first_failed_at = CASE
            WHEN auth_login_rate_limits.blocked_until IS NOT NULL
              AND auth_login_rate_limits.blocked_until > NOW()
              THEN auth_login_rate_limits.first_failed_at
            WHEN auth_login_rate_limits.first_failed_at <= NOW() - make_interval(secs => $3::int)
              THEN NOW()
            ELSE auth_login_rate_limits.first_failed_at
          END,
          last_failed_at = NOW(),
          blocked_until = CASE
            WHEN auth_login_rate_limits.blocked_until IS NOT NULL
              AND auth_login_rate_limits.blocked_until > NOW()
              THEN auth_login_rate_limits.blocked_until
            WHEN auth_login_rate_limits.first_failed_at <= NOW() - make_interval(secs => $3::int)
              THEN NULL
            WHEN auth_login_rate_limits.failed_attempts + 1 >= $4::int
              THEN NOW() + make_interval(secs => $5::int)
            ELSE NULL
          END,
          updated_at = NOW()
        RETURNING failed_attempts, blocked_until
      `,
      [
        scope.tenantId,
        scope.email,
        policy.attemptWindowSeconds,
        policy.maxFailedAttempts,
        policy.blockDurationSeconds,
      ],
    );

    const row = rows[0];
    if (!row) {
      return {
        failedAttempts: 0,
        blockedUntil: null,
      };
    }
    return {
      failedAttempts: Number(row.failed_attempts),
      blockedUntil: parseDate(row.blocked_until),
    };
  }

  async clearFailures(
    db: DbClient,
    scope: LoginRateLimitScope,
  ): Promise<void> {
    await db.query(
      `
        DELETE FROM auth_login_rate_limits
        WHERE tenant_id = $1
          AND email = $2
      `,
      [scope.tenantId, scope.email],
    );
  }
}
