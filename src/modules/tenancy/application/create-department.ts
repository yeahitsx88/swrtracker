import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { Department } from '../domain/types';
import type { ITenancyRepository } from './ports';
import { assertProjectConfigAdmin } from './shared';

type DepartmentContext = {
  tenantId: UUID;
  projectId: UUID;
  actorRole: ProjectRole | TenantRole;
};

export async function createDepartment(
  repo: ITenancyRepository, db: DbClient,
  params: DepartmentContext & {
    actorId: UUID; name: string; managerTitle: string; aorNodeIds: UUID[];
  },
): Promise<Department> {
  assertProjectConfigAdmin(params.actorRole);
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');

  const name = params.name.trim();
  const managerTitle = params.managerTitle.trim();
  if (!name || name.length > 120 || !managerTitle || managerTitle.length > 120) {
    throw new ValidationError('Department name and manager title must be 1–120 characters');
  }
  if (params.aorNodeIds.length < 1 || params.aorNodeIds.length > 128 ||
      new Set(params.aorNodeIds).size !== params.aorNodeIds.length) {
    throw new ValidationError('Provide 1–128 distinct AOR node IDs');
  }
  for (const nodeId of params.aorNodeIds) {
    if (!(await repo.findAorNodePlacement(db, params.tenantId, params.projectId, nodeId))) {
      throw new NotFoundError('AOR node not found in this project');
    }
  }

  const department: Department = {
    id: randomUUID() as UUID,
    tenantId: params.tenantId,
    projectId: params.projectId,
    name,
    managerTitle,
    createdBy: params.actorId,
    createdAt: new Date(),
  };
  if (!(await repo.saveDepartment(db, department))) {
    throw new ConflictError('Department could not be created');
  }
  await repo.saveDepartmentManagerTitle(db, department);
  for (const nodeId of params.aorNodeIds) {
    if (!(await repo.assignDepartmentAor(db, department, nodeId))) {
      throw new NotFoundError('Active AOR node not found in this project');
    }
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'department.created', { projectId: params.projectId,
      departmentId: department.id, department_name: name,
      manager_title: managerTitle, aor_node_ids: params.aorNodeIds });
  return department;
}

export async function listProjectDepartments(
  repo: ITenancyRepository, db: DbClient,
  params: DepartmentContext,
): Promise<Department[]> {
  assertProjectConfigAdmin(params.actorRole);
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  return repo.listDepartments(db, params.tenantId, params.projectId);
}
