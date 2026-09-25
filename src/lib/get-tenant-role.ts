import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';

export async function getTenantRole(
  db: DbClient, tenantId: UUID, userId: UUID,
): Promise<TenantRole | null> {
  const { rows } = await db.query<{ role: TenantRole }>(
    `SELECT tm.role FROM tenant_memberships tm
     JOIN users u ON u.id = tm.user_id AND u.tenant_id = tm.tenant_id
     WHERE tm.tenant_id = $1 AND tm.user_id = $2
       AND u.deactivated_at IS NULL LIMIT 1`,
    [tenantId, userId],
  );
  return rows[0]?.role ?? null;
}

export async function requireTenantAdmin(
  db: DbClient, tenantId: UUID, userId: UUID,
): Promise<'TENANT_ADMIN'> {
  if (await getTenantRole(db, tenantId, userId) !== 'TENANT_ADMIN') {
    throw new ForbiddenError('TENANT_ADMIN role required');
  }
  return 'TENANT_ADMIN';
}
