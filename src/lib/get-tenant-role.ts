/**
 * Fetches the authenticated user's tenant-level role.
 * Returns null when the user has no tenant membership within the tenant scope.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';

interface TenantMembershipRow {
  role: string;
}

export async function getTenantRole(
  db: DbClient,
  tenantId: UUID,
  userId: UUID,
): Promise<TenantRole | null> {
  const { rows } = await db.query<TenantMembershipRow>(
    `SELECT role
     FROM tenant_memberships
     WHERE tenant_id = $1
       AND user_id   = $2
     LIMIT 1`,
    [tenantId, userId],
  );

  return (rows[0]?.role as TenantRole | undefined) ?? null;
}
