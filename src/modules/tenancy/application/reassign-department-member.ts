import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { DepartmentMembership } from '../domain/types';
import type { ITenancyRepository } from './ports';

type MembershipAdminRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export interface ReassignDepartmentMemberParams {
  tenantId: UUID;
  projectId: UUID;
  departmentId: UUID;
  userId: UUID;
  actorRole: MembershipAdminRole;
}

function assertMembershipAdminRole(actorRole: MembershipAdminRole): void {
  if (actorRole !== 'PROJECT_ADMIN' && actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may reassign department members');
  }
}

export async function reassignDepartmentMember(
  repo: ITenancyRepository,
  db: DbClient,
  params: ReassignDepartmentMemberParams,
): Promise<DepartmentMembership> {
  assertMembershipAdminRole(params.actorRole);

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');

  const targetDepartment = await repo.findDepartmentById(db, params.tenantId, params.departmentId);
  if (!targetDepartment || targetDepartment.projectId !== params.projectId) {
    throw new NotFoundError('Department not found');
  }

  const membership = await repo.findDepartmentMembershipByUser(
    db,
    params.tenantId,
    params.projectId,
    params.userId,
  );
  if (!membership) {
    throw new NotFoundError('Department member not found');
  }
  if (membership.departmentId === params.departmentId) {
    throw new ConflictError('Department member already belongs to this department');
  }

  const updatedMembership: DepartmentMembership = {
    ...membership,
    departmentId: params.departmentId,
    title: null,
    assignedBy: null,
    assignedAt: null,
    superintendentId: null,
  };
  await repo.updateDepartmentMembership(db, updatedMembership);
  return updatedMembership;
}
