import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { ITenancyRepository } from './ports';

export async function assignAorSuperintendent(
  repo: ITenancyRepository, db: DbClient,
  params: { tenantId: UUID; projectId: UUID; actorId: UUID;
    actorRole: ProjectRole | TenantRole; nodeId: UUID; userId: UUID },
): Promise<void> {
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');
  if (params.actorRole !== 'SURVEY_MANAGER' &&
      !(project.status === 'SETUP' &&
        (params.actorRole === 'PROJECT_ADMIN' || params.actorRole === 'TENANT_ADMIN'))) {
    throw new ForbiddenError('Survey Manager or setup administrator required');
  }
  if (!(await repo.assignAorSuperintendent(db, params.tenantId, params.projectId,
    params.nodeId, params.userId))) {
    throw new NotFoundError('Active AOR node or Survey Superintendent membership not found');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'aor.node_assigned', { projectId: params.projectId,
      nodeId: params.nodeId, userId: params.userId });
}
