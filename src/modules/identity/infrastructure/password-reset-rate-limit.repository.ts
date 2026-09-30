import { createHash } from 'crypto';
import { isIP } from 'net';
import type { NextRequest } from 'next/server';
import type { DbClient, UUID } from '@/shared/types';

function scopeHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Only use a forwarding header when deployment explicitly trusts its ingress.
function sourceKey(req: NextRequest): string | null {
  if (process.env.TRUST_PROXY_IP_HEADERS !== 'true') return null;
  const candidate = req.headers.get('x-real-ip')?.trim() ?? '';
  return isIP(candidate) ? candidate : null;
}

export class PasswordResetRateLimitRepository {
  async allowAttempt(db: DbClient, tenantId: UUID, email: string, req: NextRequest): Promise<boolean> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      return false;
    }
    const { rows: tenants } = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM tenants WHERE id = $1) AS exists`, [tenantId],
    );
    if (tenants[0]?.exists !== true) return false;
    const source = sourceKey(req);
    const record = async (key: string, max: number): Promise<boolean> => {
      const { rows } = await db.query<{ attempts: number }>(
        `INSERT INTO auth_password_reset_rate_limits
           (scope_key, attempts, window_started_at, updated_at)
         VALUES ($1, 1, NOW(), NOW())
         ON CONFLICT (scope_key) DO UPDATE SET
           attempts = CASE WHEN auth_password_reset_rate_limits.window_started_at
             <= NOW() - make_interval(secs => $2::int)
             THEN 1 ELSE auth_password_reset_rate_limits.attempts + 1 END,
           window_started_at = CASE WHEN auth_password_reset_rate_limits.window_started_at
             <= NOW() - make_interval(secs => $2::int)
             THEN NOW() ELSE auth_password_reset_rate_limits.window_started_at END,
           updated_at = NOW()
         RETURNING attempts`,
        [key, 15 * 60],
      );
      return Number(rows[0]?.attempts ?? max + 1) <= max;
    };

    // A trustworthy client-IP bucket is available only behind a configured
    // ingress that overwrites X-Real-IP. Never create a shared tenant-wide
    // fallback bucket: one attacker could deny recovery to every user.
    if (source && !await record(scopeHash(`source:${tenantId}:${source}`), 30)) return false;

    // Unknown emails never create attacker-chosen keys. Existing local users
    // are finite, and their rate buckets use the stable internal user ID.
    const { rows: users } = await db.query<{ id: UUID }>(
      `SELECT id FROM users
       WHERE tenant_id = $1 AND LOWER(email) = LOWER($2)
         AND auth_method = 'LOCAL' AND password_hash IS NOT NULL
       LIMIT 1`,
      [tenantId, email],
    );
    const userId = users[0]?.id;
    return userId ? record(scopeHash(`account:${tenantId}:${userId}`), 3) : true;
  }
}
