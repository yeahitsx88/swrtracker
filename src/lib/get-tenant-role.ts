/**
 * Fetches the authenticated user's tenant-level role.
 * Returns null when the user has no tenant-level membership.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';
import { assertActiveSession } from './auth';

interface TenantMembershipRow {
  role: string;
}

export async function getTenantRole(
  db: DbClient,
  tenantId: UUID,
  userId: UUID,
  sessionVersion?: number,
): Promise<TenantRole | null> {
  if (sessionVersion !== undefined) {
    await assertActiveSession(db, { tenantId, userId, sessionVersion });
  }

  const { rows } = await db.query<TenantMembershipRow>(
    `SELECT role
     FROM tenant_memberships tm
     JOIN users u ON u.id=tm.user_id AND u.tenant_id=tm.tenant_id
     JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
     WHERE tm.tenant_id = $1
       AND tm.user_id = $2
       AND u.deactivated_at IS NULL
       AND (tm.role <> 'TENANT_ADMIN' OR c.type IN ('GC','OWNER_REP'))
     LIMIT 1`,
    [tenantId, userId],
  );

  return (rows[0]?.role as TenantRole | undefined) ?? null;
}
