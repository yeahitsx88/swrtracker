import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type {
  Department, DepartmentAssignmentLayer, DepartmentPriority,
  DepartmentTitle, DepartmentMembership,
} from '../domain/types';
import type { ITenancyRepository } from './ports';
import { assignDepartmentTitle } from './manage-department';
import { moveAorAssignment } from './aor-operations';
import { assertProjectConfigAdmin } from './shared';

interface Context {
  tenantId: UUID; projectId: UUID; departmentId: UUID;
  actorId: UUID; actorRole: ProjectRole | TenantRole;
}

async function findDepartmentForWrite(
  repo: ITenancyRepository, db: DbClient, params: Context,
): Promise<Department> {
  const project = await repo.lockProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');
  const department = await repo.findDepartment(
    db, params.tenantId, params.projectId, params.departmentId,
  );
  if (!department) throw new NotFoundError('Department not found in this project');
  return department;
}

async function activeMember(
  repo: ITenancyRepository, db: DbClient, params: Context, userId: UUID,
): Promise<DepartmentMembership> {
  const member = await repo.findDepartmentMembership(
    db, params.tenantId, params.projectId, userId,
  );
  if (!member || member.departmentId !== params.departmentId || member.deactivatedAt) {
    throw new NotFoundError('Active member not found in this department');
  }
  return member;
}

async function assertDepartmentManagerOrAdmin(
  repo: ITenancyRepository, db: DbClient, params: Context,
): Promise<void> {
  if (params.actorRole === 'TENANT_ADMIN' || params.actorRole === 'PROJECT_ADMIN') return;
  if (params.actorRole !== 'DEPARTMENT_MANAGER') {
    throw new ForbiddenError('Department Manager or project administrator required');
  }
  await activeMember(repo, db, params, params.actorId);
}

async function authorizeTitle(
  repo: ITenancyRepository, db: DbClient, params: Context,
  department: Department, title: DepartmentTitle,
  target: DepartmentMembership,
): Promise<UUID | null> {
  if (title.title === department.managerTitle) {
    assertProjectConfigAdmin(params.actorRole);
    return null;
  }
  if (title.assignmentLayer === 'MANAGER') {
    if (params.actorRole !== 'DEPARTMENT_MANAGER') {
      throw new ForbiddenError('Department Manager required for this title');
    }
    await activeMember(repo, db, params, params.actorId);
    return null;
  }
  if (params.actorRole !== 'DEPARTMENT_LEAD') {
    throw new ForbiddenError('Department Lead required for this title');
  }
  await activeMember(repo, db, params, params.actorId);
  if (target.superintendentId && target.superintendentId !== params.actorId) {
    throw new ForbiddenError('Member is claimed by another Department Lead');
  }
  return params.actorId;
}

export async function reassignDepartmentTitle(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { userId: UUID; title: string },
): Promise<void> {
  const department = await findDepartmentForWrite(repo, db, params);
  const member = await activeMember(repo, db, params, params.userId);
  if (!member.title) throw new ConflictError('Member is a free agent; use first title assignment');
  const newTitle = params.title.trim();
  if (!newTitle || newTitle.length > 120) {
    throw new ValidationError('Title must be 1-120 characters');
  }
  if (newTitle === member.title) throw new ConflictError('Member already has this title');
  if (member.title === department.managerTitle) {
    assertProjectConfigAdmin(params.actorRole);
  }
  const title = await repo.findDepartmentTitle(
    db, params.tenantId, params.departmentId, newTitle,
  );
  if (!title) throw new NotFoundError('Title not found in this department');
  const superintendentId = member.title === department.managerTitle
    ? null
    : await authorizeTitle(repo, db, params, department, title, member);
  if (member.title === department.managerTitle &&
      await repo.countActiveDepartmentManagers(db, params.tenantId,
        params.projectId, params.departmentId, department.managerTitle) <= 1) {
    throw new ConflictError('Assign a replacement Department Manager before changing this title');
  }
  if (!(await repo.reassignDepartmentTitle(db, params.tenantId,
    params.projectId, params.departmentId, params.userId,
    member.title, newTitle, params.actorId, superintendentId))) {
    throw new ConflictError('Department title changed concurrently');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'department.title_reassigned', { projectId: params.projectId,
      departmentId: params.departmentId, userId: params.userId,
      oldTitle: member.title, newTitle,
      assignmentLayer: title.assignmentLayer });
}

export async function removeDepartmentMember(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { userId: UUID; reason: string },
): Promise<void> {
  assertProjectConfigAdmin(params.actorRole);
  const department = await findDepartmentForWrite(repo, db, params);
  const member = await activeMember(repo, db, params, params.userId);
  const reason = params.reason.trim();
  if (member.title && !reason) throw new ValidationError('Reason is required for a titled member');
  if (reason.length > 500) throw new ValidationError('Reason must be 500 characters or less');
  if (member.title === department.managerTitle &&
      await repo.countActiveDepartmentManagers(db, params.tenantId,
        params.projectId, params.departmentId, department.managerTitle) <= 1) {
    throw new ConflictError('Assign a replacement Department Manager before removing this member');
  }
  if (!(await repo.removeDepartmentMember(db, params.tenantId,
    params.projectId, params.departmentId, params.userId))) {
    throw new ConflictError('Department membership changed concurrently');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'department.member_removed', { projectId: params.projectId,
      departmentId: params.departmentId, userId: params.userId,
      oldTitle: member.title, reason: reason || null });
}

export async function updateDepartmentCatalogTitle(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { oldTitle: string; title: string;
    defaultPriority: DepartmentPriority;
    assignmentLayer: DepartmentAssignmentLayer },
): Promise<void> {
  const department = await findDepartmentForWrite(repo, db, params);
  const oldName = params.oldTitle.trim();
  const newName = params.title.trim();
  if (!oldName || !newName || newName.length > 120 ||
      !['HIGH', 'MED_HIGH', 'MEDIUM', 'NORMAL'].includes(params.defaultPriority) ||
      !['MANAGER', 'SUPERINTENDENT'].includes(params.assignmentLayer)) {
    throw new ValidationError('Title, priority, or assignment layer is invalid');
  }
  if (oldName === department.managerTitle) {
    assertProjectConfigAdmin(params.actorRole);
    if (params.assignmentLayer !== 'MANAGER') {
      throw new ValidationError('Department Manager title must remain at MANAGER layer');
    }
  } else {
    await assertDepartmentManagerOrAdmin(repo, db, params);
  }
  const previous = await repo.findDepartmentTitle(
    db, params.tenantId, params.departmentId, oldName,
  );
  if (!previous) throw new NotFoundError('Department title not found');
  if (previous.title === newName &&
      previous.defaultPriority === params.defaultPriority &&
      previous.assignmentLayer === params.assignmentLayer) return;
  if (oldName !== newName && await repo.findDepartmentTitle(
    db, params.tenantId, params.departmentId, newName,
  )) throw new ConflictError('Department title already exists');
  if (!(await repo.updateDepartmentTitleCatalog(db, params.tenantId,
    params.departmentId, oldName, newName,
    params.defaultPriority, params.assignmentLayer))) {
    throw new ConflictError('Department title changed concurrently');
  }
  if (oldName !== newName) {
    if (oldName === department.managerTitle &&
        !(await repo.renameDepartmentManagerTitle(db, params.tenantId,
          params.projectId, params.departmentId, oldName, newName))) {
      throw new ConflictError('Department Manager title changed concurrently');
    }
    await repo.renameDepartmentMemberTitles(db, params.tenantId,
      params.projectId, params.departmentId, oldName, newName);
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'department.title_catalog_updated', { projectId: params.projectId,
      departmentId: params.departmentId, oldTitle: oldName,
      title: newName, previousDefaultPriority: previous.defaultPriority,
      defaultPriority: params.defaultPriority,
      previousAssignmentLayer: previous.assignmentLayer,
      assignmentLayer: params.assignmentLayer });
}

export async function assignMissingDepartmentManager(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { userId: UUID },
): Promise<void> {
  assertProjectConfigAdmin(params.actorRole);
  const department = await findDepartmentForWrite(repo, db, params);
  if (await repo.countActiveDepartmentManagers(db, params.tenantId,
    params.projectId, params.departmentId, department.managerTitle) > 0) {
    throw new ConflictError('Department already has an active Manager');
  }
  await assignDepartmentTitle(repo, db,
    { ...params, userId: params.userId, title: department.managerTitle });
}

export async function reassignDepartmentAor(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { assignmentId: UUID; nodeId: UUID },
): Promise<void> {
  assertProjectConfigAdmin(params.actorRole);
  await findDepartmentForWrite(repo, db, params);
  const assignment = await repo.findAorAssignment(
    db, params.tenantId, params.projectId, params.assignmentId,
  );
  if (!assignment || assignment.departmentId !== params.departmentId ||
      assignment.deactivatedAt) throw new NotFoundError('Active department AOR assignment not found');
  await moveAorAssignment(repo, db,
    { tenantId: params.tenantId, projectId: params.projectId,
      actorId: params.actorId, actorRole: params.actorRole,
      assignmentId: params.assignmentId, nodeId: params.nodeId });
}
