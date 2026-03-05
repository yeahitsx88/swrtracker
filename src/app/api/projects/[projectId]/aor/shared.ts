import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { getProjectRole } from '@/lib/get-project-role';
import { getTenantRole } from '@/lib/get-tenant-role';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { DbClient, UUID } from '@/shared/types';

export type ProjectSetupActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export async function resolveProjectSetupActorRole(
  db: DbClient,
  tenantId: UUID,
  projectId: UUID,
  userId: UUID,
  sessionVersion?: number,
): Promise<ProjectSetupActorRole> {
  const tenantRole = await getTenantRole(db, tenantId, userId, sessionVersion);
  const actorRole =
    tenantRole === 'TENANT_ADMIN'
      ? 'TENANT_ADMIN'
      : await getProjectRole(db, tenantId, projectId, userId, sessionVersion);
  if (actorRole !== 'PROJECT_ADMIN' && actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may manage the AOR setup surface');
  }
  return actorRole;
}

export async function assertProjectSetupMutable(
  db: DbClient,
  tenantId: UUID,
  projectId: UUID,
): Promise<void> {
  const project = await new TenancyRepository().findProjectById(db, tenantId, projectId);
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  if (project.status === 'ACTIVE') {
    throw new ConflictError('Project setup is locked after activation');
  }
  if (project.status === 'ARCHIVED') {
    throw new ConflictError('Archived projects are read-only');
  }
}
