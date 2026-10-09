import {assertPreparationNotCancelling} from '@/lib/recommissioning-gate';
import { ConflictError, NotFoundError } from '@/shared/errors';


import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { DbClient, UUID } from '@/shared/types';
import { assertProjectAdministrator } from '@/lib/project-capabilities';

export type ProjectSetupActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export async function resolveProjectSetupActorRole(
  db: DbClient,
  tenantId: UUID,
  projectId: UUID,
  userId: UUID,
  sessionVersion?: number,
): Promise<ProjectSetupActorRole> {
  const capabilities = await assertProjectAdministrator(db,{tenantId,userId,sessionVersion:sessionVersion??1},projectId);
  return capabilities.centralIT?'TENANT_ADMIN':'PROJECT_ADMIN';
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
  await assertPreparationNotCancelling(db,tenantId,projectId);
}
