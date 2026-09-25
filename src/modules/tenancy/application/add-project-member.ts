import { randomUUID } from 'crypto';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { ITenancyRepository } from './ports';

export interface AddProjectMemberParams {
  tenantId:   UUID;
  projectId:  UUID;
  userId:     UUID;
  role:       ProjectRole;
  actorRole:  ProjectRole | TenantRole;
}

export async function addProjectMember(
  repo: ITenancyRepository,
  db: DbClient,
  params: AddProjectMemberParams,
): Promise<void> {
  if (params.actorRole !== 'TENANT_ADMIN' && params.actorRole !== 'PROJECT_ADMIN') {
    throw new ForbiddenError('Project configuration administrator required');
  }
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');
  if (params.actorRole === 'PROJECT_ADMIN' && project.status !== 'SETUP') {
    throw new ForbiddenError('PROJECT_ADMIN may add project members during SETUP only');
  }

  await repo.saveMembership(db, {
    id:        randomUUID() as UUID,
    tenantId:  params.tenantId,
    projectId: params.projectId,
    userId:    params.userId,
    role:      params.role,
    createdAt: new Date(),
  });
}
