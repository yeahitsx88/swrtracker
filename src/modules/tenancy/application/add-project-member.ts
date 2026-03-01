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

  await repo.saveMembership(db, {
    id:        randomUUID() as UUID,
    projectId: params.projectId,
    userId:    params.userId,
    role:      params.role,
    createdAt: new Date(),
  });
}
