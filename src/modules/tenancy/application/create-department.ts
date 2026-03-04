import { randomUUID } from 'crypto';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { Department, DepartmentTitle } from '../domain/types';
import type { ITenancyRepository } from './ports';

type SetupActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export interface CreateDepartmentParams {
  tenantId: UUID;
  projectId: UUID;
  name: string;
  managerTitle: string;
  actorId: UUID;
  actorRole: SetupActorRole;
}

function assertSetupActorRole(actorRole: SetupActorRole): void {
  if (actorRole !== 'PROJECT_ADMIN' && actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may create departments');
  }
}

export async function createDepartment(
  repo: ITenancyRepository,
  db: DbClient,
  params: CreateDepartmentParams,
): Promise<Department> {
  assertSetupActorRole(params.actorRole);

  const name = params.name.trim();
  const managerTitle = params.managerTitle.trim();
  if (!name) throw new ValidationError('name is required');
  if (!managerTitle) throw new ValidationError('managerTitle is required');

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');

  const createdAt = new Date();
  const department: Department = {
    id: randomUUID() as UUID,
    projectId: params.projectId,
    tenantId: params.tenantId,
    name,
    managerTitle,
    createdBy: params.actorId,
    createdAt,
  };
  const managerTitleCatalogEntry: DepartmentTitle = {
    id: randomUUID() as UUID,
    tenantId: params.tenantId,
    departmentId: department.id,
    title: managerTitle,
    defaultPriority: 'MED_HIGH',
    assignmentLayer: 'MANAGER',
    createdAt,
  };

  await repo.saveDepartment(db, department);
  await repo.saveDepartmentTitle(db, managerTitleCatalogEntry);

  return department;
}
