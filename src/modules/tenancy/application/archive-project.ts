import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { Project } from '../domain/types';
import type { ITenancyRepository } from './ports';

export interface ArchiveProjectParams {
  tenantId: UUID;
  projectId: UUID;
  actorId: UUID;
  actorRole: TenantRole | null;
}

export async function archiveProject(
  repo: ITenancyRepository,
  db: DbClient,
  params: ArchiveProjectParams,
): Promise<Project> {
  if (params.actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only TENANT_ADMIN can archive projects');
  }

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.status !== 'ACTIVE') {
    throw new ConflictError('Only ACTIVE projects can be archived');
  }

  const archivedAt = new Date();
  await repo.markProjectArchived(
    db,
    params.tenantId,
    params.projectId,
    archivedAt,
    params.actorId,
  );

  return {
    ...project,
    status: 'ARCHIVED',
    archivedAt,
    archivedBy: params.actorId,
  };
}
