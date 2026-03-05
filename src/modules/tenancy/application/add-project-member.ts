import { randomUUID } from 'crypto';
import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { ITenancyRepository } from './ports';

export interface AddProjectMemberParams {
  tenantId:   UUID;
  projectId:  UUID;
  userId:     UUID;
  role:       ProjectRole;
  actorRole:  ProjectRole | 'TENANT_ADMIN';
}

export async function addProjectMember(
  repo: ITenancyRepository,
  db: DbClient,
  params: AddProjectMemberParams,
): Promise<void> {
  if (params.actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only TENANT_ADMIN can add project members');
  }

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) {
    throw new ForbiddenError(
      'Project membership mutation violates tenant boundary',
      'SEC_TENANT_BOUNDARY_VIOLATION',
    );
  }

  await repo.saveMembership(db, {
    id:        randomUUID() as UUID,
    tenantId:  params.tenantId,
    projectId: params.projectId,
    userId:    params.userId,
    role:      params.role,
    createdAt: new Date(),
  });

  await repo.bumpUserSessionVersion?.(db, params.tenantId, params.userId);
}
