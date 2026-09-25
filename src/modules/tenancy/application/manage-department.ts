import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type {
  Department, DepartmentAssignmentLayer, DepartmentPriority, DepartmentTitle,
} from '../domain/types';
import type { ITenancyRepository } from './ports';
import { assertProjectConfigAdmin } from './shared';

type Context = {
  tenantId: UUID; projectId: UUID; departmentId: UUID;
  actorId: UUID; actorRole: ProjectRole | TenantRole;
};

async function findMutableDepartment(
  repo: ITenancyRepository, db: DbClient, params: Context,
): Promise<Department> {
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');
  const department = await repo.findDepartment(
    db, params.tenantId, params.projectId, params.departmentId);
  if (!department) throw new NotFoundError('Department not found in this project');
  return department;
}

export async function addDepartmentMember(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { userId: UUID },
): Promise<void> {
  assertProjectConfigAdmin(params.actorRole);
  await findMutableDepartment(repo, db, params);
  if (await repo.findDepartmentMembership(
    db, params.tenantId, params.projectId, params.userId)) {
    throw new ConflictError('User already belongs to a department in this project');
  }
  if (!(await repo.addDepartmentMember(db, params.tenantId, params.projectId,
    params.departmentId, params.userId))) {
    if (await repo.findDepartmentMembership(
      db, params.tenantId, params.projectId, params.userId)) {
      throw new ConflictError('User already belongs to a department in this project');
    }
    throw new NotFoundError('Active project member not found or department membership already exists');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'department.member_added', { projectId: params.projectId,
      departmentId: params.departmentId, userId: params.userId });
}

export async function addDepartmentTitle(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { title: string; defaultPriority: DepartmentPriority;
    assignmentLayer: DepartmentAssignmentLayer },
): Promise<DepartmentTitle> {
  const department = await findMutableDepartment(repo, db, params);
  if (params.actorRole !== 'TENANT_ADMIN' && params.actorRole !== 'PROJECT_ADMIN') {
    if (params.actorRole !== 'DEPARTMENT_MANAGER') {
      throw new ForbiddenError('Department Manager or project administrator required');
    }
    const actorMembership = await repo.findDepartmentMembership(
      db, params.tenantId, params.projectId, params.actorId);
    if (actorMembership?.departmentId !== department.id || actorMembership.deactivatedAt) {
      throw new ForbiddenError('Department Manager must belong to this department');
    }
  }
  const name = params.title.trim();
  if (!name || name.length > 120 || name === department.managerTitle ||
      !['HIGH', 'MED_HIGH', 'MEDIUM', 'NORMAL'].includes(params.defaultPriority) ||
      !['MANAGER', 'SUPERINTENDENT'].includes(params.assignmentLayer)) {
    throw new ValidationError('Department title, priority, or assignment layer is invalid');
  }
  const title: DepartmentTitle = {
    id: randomUUID() as UUID, tenantId: params.tenantId,
    departmentId: department.id, title: name,
    defaultPriority: params.defaultPriority,
    assignmentLayer: params.assignmentLayer, createdAt: new Date(),
  };
  if (!(await repo.addDepartmentTitle(db, title))) {
    throw new ConflictError('Department title already exists');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'department.title_catalog_updated', { projectId: params.projectId,
      departmentId: department.id, title: name,
      defaultPriority: title.defaultPriority,
      assignmentLayer: title.assignmentLayer });
  return title;
}

export async function assignDepartmentTitle(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { userId: UUID; title: string },
): Promise<void> {
  const department = await findMutableDepartment(repo, db, params);
  const titleName = params.title.trim();
  if (!titleName || titleName.length > 120) {
    throw new ValidationError('Title must be 1–120 characters');
  }
  const title = await repo.findDepartmentTitle(
    db, params.tenantId, params.departmentId, titleName);
  if (!title) throw new NotFoundError('Title not found in this department');
  const target = await repo.findDepartmentMembership(
    db, params.tenantId, params.projectId, params.userId);
  if (!target || target.departmentId !== department.id || target.deactivatedAt) {
    throw new NotFoundError('Active member not found in this department');
  }
  if (target.title !== null) {
    throw new ConflictError('Member already has a title');
  }

  let superintendentId: UUID | null = null;
  if (title.title === department.managerTitle) {
    assertProjectConfigAdmin(params.actorRole);
  } else if (title.assignmentLayer === 'MANAGER') {
    if (params.actorRole !== 'DEPARTMENT_MANAGER') {
      throw new ForbiddenError('Department Manager required for this title');
    }
  } else {
    if (params.actorRole !== 'DEPARTMENT_LEAD') {
      throw new ForbiddenError('Department Lead required for this title');
    }
    if (target.superintendentId && target.superintendentId !== params.actorId) {
      throw new ForbiddenError('Member is claimed by another Department Lead');
    }
    superintendentId = params.actorId;
  }
  if (params.actorRole === 'DEPARTMENT_MANAGER' ||
      params.actorRole === 'DEPARTMENT_LEAD') {
    const actorMembership = await repo.findDepartmentMembership(
      db, params.tenantId, params.projectId, params.actorId);
    if (actorMembership?.departmentId !== department.id || actorMembership.deactivatedAt) {
      throw new ForbiddenError('Actor must belong to this department');
    }
  }
  if (!(await repo.assignDepartmentTitle(db, params.tenantId, params.projectId,
    department.id, params.userId, title.title, params.actorId, superintendentId))) {
    throw new ConflictError('Member is no longer available for this title');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'department.title_assigned', { projectId: params.projectId,
      departmentId: department.id, userId: params.userId,
      title: title.title, assignment_layer: title.assignmentLayer });
}
