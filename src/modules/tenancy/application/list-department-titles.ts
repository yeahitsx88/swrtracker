import { ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { DepartmentTitle } from '../domain/types';
import type { ITenancyRepository } from './ports';

type SetupActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export interface ListDepartmentTitlesParams {
  tenantId: UUID;
  projectId: UUID;
  departmentId: UUID;
  actorRole: SetupActorRole;
}

function assertSetupActorRole(actorRole: SetupActorRole): void {
  if (actorRole !== 'PROJECT_ADMIN' && actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may list department titles');
  }
}

export async function listDepartmentTitles(
  repo: ITenancyRepository,
  db: DbClient,
  params: ListDepartmentTitlesParams,
): Promise<DepartmentTitle[]> {
  assertSetupActorRole(params.actorRole);

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');

  const department = await repo.findDepartmentById(db, params.tenantId, params.departmentId);
  if (!department || department.projectId !== params.projectId) {
    throw new NotFoundError('Department not found');
  }

  return repo.listDepartmentTitles(db, params.tenantId, params.departmentId);
}
