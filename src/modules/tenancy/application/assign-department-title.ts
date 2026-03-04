import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import type { DepartmentMembership } from '../domain/types';
import type { ITenancyRepository } from './ports';

type AssignmentActorRole = 'TENANT_ADMIN' | ProjectRole;

export interface AssignDepartmentTitleParams {
  tenantId: UUID;
  projectId: UUID;
  departmentId: UUID;
  userId: UUID;
  title: string;
  actorId: UUID;
  actorRole: AssignmentActorRole;
  superintendentId?: UUID | null;
}

function isActorAllowed(actorRole: AssignmentActorRole): boolean {
  return (
    actorRole === 'TENANT_ADMIN' ||
    actorRole === 'PROJECT_ADMIN' ||
    actorRole === 'DEPARTMENT_MANAGER' ||
    actorRole === 'DEPARTMENT_LEAD'
  );
}

async function assertActorDepartmentScope(
  repo: ITenancyRepository,
  db: DbClient,
  params: { tenantId: UUID; projectId: UUID; departmentId: UUID; actorId: UUID; actorRole: AssignmentActorRole },
): Promise<void> {
  if (params.actorRole !== 'DEPARTMENT_MANAGER' && params.actorRole !== 'DEPARTMENT_LEAD') {
    return;
  }

  const actorMembership = await repo.findDepartmentMembershipByUser(
    db,
    params.tenantId,
    params.projectId,
    params.actorId,
  );
  if (!actorMembership || actorMembership.departmentId !== params.departmentId) {
    throw new ForbiddenError('Department role actors may assign titles only within their department');
  }
}

export async function assignDepartmentTitle(
  repo: ITenancyRepository,
  db: DbClient,
  params: AssignDepartmentTitleParams,
): Promise<DepartmentMembership> {
  if (!isActorAllowed(params.actorRole)) {
    throw new ForbiddenError('Only configured department assignment roles may assign department titles');
  }

  const titleName = params.title.trim();
  if (!titleName) throw new ValidationError('title is required');

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');

  const department = await repo.findDepartmentById(db, params.tenantId, params.departmentId);
  if (!department || department.projectId !== params.projectId) {
    throw new NotFoundError('Department not found');
  }

  await assertActorDepartmentScope(repo, db, {
    tenantId: params.tenantId,
    projectId: params.projectId,
    departmentId: params.departmentId,
    actorId: params.actorId,
    actorRole: params.actorRole,
  });

  const membership = await repo.findDepartmentMembershipByUser(
    db,
    params.tenantId,
    params.projectId,
    params.userId,
  );
  if (!membership || membership.departmentId !== params.departmentId) {
    throw new NotFoundError('Department member not found');
  }
  if (membership.title !== null) {
    throw new ConflictError('Department member is not in the free-agent pool');
  }

  const departmentTitle = await repo.findDepartmentTitleByName(
    db,
    params.tenantId,
    params.departmentId,
    titleName,
  );
  if (!departmentTitle) {
    throw new NotFoundError('Department title not found');
  }

  let resolvedSuperintendentId: UUID | null = null;
  if (departmentTitle.assignmentLayer === 'MANAGER') {
    if (params.actorRole !== 'TENANT_ADMIN' && params.actorRole !== 'PROJECT_ADMIN') {
      throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may assign manager-layer titles');
    }
    if (params.superintendentId) {
      throw new ValidationError('superintendentId is not allowed for manager-layer titles');
    }
  } else {
    if (params.actorRole === 'TENANT_ADMIN' || params.actorRole === 'PROJECT_ADMIN') {
      throw new ForbiddenError('PROJECT_ADMIN and TENANT_ADMIN may not assign superintendent-layer titles');
    }
    if (params.actorRole === 'DEPARTMENT_MANAGER') {
      if (params.superintendentId) {
        throw new ValidationError('superintendentId is not allowed when DEPARTMENT_MANAGER assigns a title');
      }
      resolvedSuperintendentId = null;
    } else {
      resolvedSuperintendentId = params.actorId;
      if (params.superintendentId && params.superintendentId !== params.actorId) {
        throw new ValidationError('superintendentId must match the acting department lead');
      }
    }
  }

  const updatedMembership: DepartmentMembership = {
    ...membership,
    title: departmentTitle.title,
    assignedBy: params.actorId,
    assignedAt: new Date(),
    superintendentId: resolvedSuperintendentId,
  };
  await repo.updateDepartmentMembership(db, updatedMembership);
  return updatedMembership;
}
