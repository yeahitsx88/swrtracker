import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import { getTenantRole } from './get-tenant-role';
import { getProjectRole } from './get-project-role';

export async function getProjectConfigRole(
  db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID,
): Promise<ProjectRole | TenantRole> {
  const tenantRole = await getTenantRole(db, tenantId, actorId);
  return tenantRole === 'TENANT_ADMIN' ? tenantRole
    : getProjectRole(db, tenantId, projectId, actorId);
}
