import { randomUUID } from 'crypto';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { DepartmentMembership } from '../domain/types';
import type { ITenancyRepository } from './ports';

type MembershipAdminRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export interface AddDepartmentMemberParams {
  tenantId: UUID;
  projectId: UUID;
  departmentId: UUID;
  userId: UUID;
  actorRole: MembershipAdminRole;
}

function assertMembershipAdminRole(actorRole: MembershipAdminRole): void {
  if (actorRole !== 'PROJECT_ADMIN' && actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may add department members');
  }
}

export async function addDepartmentMember(
  repo: ITenancyRepository,
  db: DbClient,
  params: AddDepartmentMemberParams,
): Promise<DepartmentMembership> {
  assertMembershipAdminRole(params.actorRole);

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');

  const department = await repo.findDepartmentById(db, params.tenantId, params.departmentId);
  if (!department || department.projectId !== params.projectId) {
    throw new NotFoundError('Department not found');
  }

  const existing = await repo.findDepartmentMembershipByUser(
    db,
    params.tenantId,
    params.projectId,
    params.userId,
  );
  if (existing) {
    throw new ConflictError('User already belongs to a department in this project');
  }

  const membership: DepartmentMembership = {
    id: randomUUID() as UUID,
    projectId: params.projectId,
    tenantId: params.tenantId,
    userId: params.userId,
    departmentId: params.departmentId,
    title: null,
    assignedBy: null,
    assignedAt: null,
    superintendentId: null,
    deactivatedAt: null,
    createdAt: new Date(),
  };
  await repo.saveDepartmentMembership(db, membership);
  return membership;
}
