import { ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { Department } from '../domain/types';
import type { ITenancyRepository } from './ports';

type SetupActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export interface ListDepartmentsParams {
  tenantId: UUID;
  projectId: UUID;
  actorRole: SetupActorRole;
}

function assertSetupActorRole(actorRole: SetupActorRole): void {
  if (actorRole !== 'PROJECT_ADMIN' && actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may list departments');
  }
}

export async function listDepartments(
  repo: ITenancyRepository,
  db: DbClient,
  params: ListDepartmentsParams,
): Promise<Department[]> {
  assertSetupActorRole(params.actorRole);

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');

  return repo.listDepartments(db, params.tenantId, params.projectId);
}
