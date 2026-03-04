import { randomUUID } from 'crypto';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { AorAssignment } from '../domain/types';
import type { ITenancyRepository } from './ports';

type SetupActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export interface AssignAorDepartmentParams {
  tenantId: UUID;
  projectId: UUID;
  departmentId: UUID;
  aorNodeId: UUID;
  actorRole: SetupActorRole;
  deactivateAssignmentIds?: UUID[];
}

export interface DeactivateAorDepartmentAssignmentParams {
  tenantId: UUID;
  projectId: UUID;
  assignmentId: UUID;
  actorRole: SetupActorRole;
}

function assertSetupActorRole(actorRole: SetupActorRole): void {
  if (actorRole !== 'PROJECT_ADMIN' && actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may manage AOR assignments');
  }
}

async function assertProjectNodeAndDepartment(
  repo: ITenancyRepository,
  db: DbClient,
  params: { tenantId: UUID; projectId: UUID; departmentId: UUID; aorNodeId: UUID },
): Promise<void> {
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');

  const node = await repo.findAorNodeById(db, params.tenantId, params.aorNodeId);
  if (!node || node.projectId !== params.projectId) {
    throw new NotFoundError('AOR node not found');
  }

  const department = await repo.findDepartmentById(db, params.tenantId, params.departmentId);
  if (!department || department.projectId !== params.projectId) {
    throw new NotFoundError('Department not found');
  }
}

async function loadActiveDepartmentAssignment(
  repo: ITenancyRepository,
  db: DbClient,
  params: { tenantId: UUID; projectId: UUID; assignmentId: UUID },
): Promise<AorAssignment> {
  const assignment = await repo.findAorAssignmentById(db, params.tenantId, params.assignmentId);
  if (!assignment || assignment.projectId !== params.projectId || assignment.departmentId === null) {
    throw new NotFoundError('Department AOR assignment not found');
  }
  if (assignment.deactivatedAt) {
    throw new ConflictError('Department AOR assignment is already deactivated');
  }
  return assignment;
}

export async function assignAorDepartment(
  repo: ITenancyRepository,
  db: DbClient,
  params: AssignAorDepartmentParams,
): Promise<AorAssignment> {
  assertSetupActorRole(params.actorRole);
  await assertProjectNodeAndDepartment(repo, db, params);

  for (const assignmentId of params.deactivateAssignmentIds ?? []) {
    const assignment = await loadActiveDepartmentAssignment(repo, db, {
      tenantId: params.tenantId,
      projectId: params.projectId,
      assignmentId,
    });
    if (assignment.departmentId !== params.departmentId) {
      throw new NotFoundError('Department AOR assignment not found');
    }
    await repo.deactivateAorAssignment(db, params.tenantId, assignmentId, new Date());
  }

  const assignment: AorAssignment = {
    id: randomUUID() as UUID,
    projectId: params.projectId,
    tenantId: params.tenantId,
    userId: null,
    aorNodeId: params.aorNodeId,
    departmentId: params.departmentId,
    deactivatedAt: null,
    createdAt: new Date(),
  };
  await repo.saveAorAssignment(db, assignment);
  return assignment;
}

export async function deactivateAorDepartmentAssignment(
  repo: ITenancyRepository,
  db: DbClient,
  params: DeactivateAorDepartmentAssignmentParams,
): Promise<AorAssignment> {
  assertSetupActorRole(params.actorRole);

  const assignment = await loadActiveDepartmentAssignment(repo, db, {
    tenantId: params.tenantId,
    projectId: params.projectId,
    assignmentId: params.assignmentId,
  });
  const deactivatedAt = new Date();
  await repo.deactivateAorAssignment(db, params.tenantId, params.assignmentId, deactivatedAt);
  return {
    ...assignment,
    deactivatedAt,
  };
}
