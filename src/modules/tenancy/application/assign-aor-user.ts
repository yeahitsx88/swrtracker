import { randomUUID } from 'crypto';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { AorAssignment } from '../domain/types';
import type { ITenancyRepository } from './ports';

type SetupActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export interface AssignAorUserParams {
  tenantId: UUID;
  projectId: UUID;
  userId: UUID;
  aorNodeId: UUID;
  actorRole: SetupActorRole;
  deactivateAssignmentIds?: UUID[];
}

export interface DeactivateAorUserAssignmentParams {
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

async function assertProjectAndNode(
  repo: ITenancyRepository,
  db: DbClient,
  tenantId: UUID,
  projectId: UUID,
  aorNodeId: UUID,
): Promise<void> {
  const project = await repo.findProjectById(db, tenantId, projectId);
  if (!project) throw new NotFoundError('Project not found');

  const node = await repo.findAorNodeById(db, tenantId, aorNodeId);
  if (!node || node.projectId !== projectId) {
    throw new NotFoundError('AOR node not found');
  }
}

async function loadActiveUserAssignment(
  repo: ITenancyRepository,
  db: DbClient,
  params: { tenantId: UUID; projectId: UUID; assignmentId: UUID },
): Promise<AorAssignment> {
  const assignment = await repo.findAorAssignmentById(db, params.tenantId, params.assignmentId);
  if (!assignment || assignment.projectId !== params.projectId || assignment.userId === null) {
    throw new NotFoundError('User AOR assignment not found');
  }
  if (assignment.deactivatedAt) {
    throw new ConflictError('User AOR assignment is already deactivated');
  }
  return assignment;
}

export async function assignAorUser(
  repo: ITenancyRepository,
  db: DbClient,
  params: AssignAorUserParams,
): Promise<AorAssignment> {
  assertSetupActorRole(params.actorRole);
  await assertProjectAndNode(repo, db, params.tenantId, params.projectId, params.aorNodeId);

  for (const assignmentId of params.deactivateAssignmentIds ?? []) {
    const assignment = await loadActiveUserAssignment(repo, db, {
      tenantId: params.tenantId,
      projectId: params.projectId,
      assignmentId,
    });
    if (assignment.userId !== params.userId) {
      throw new NotFoundError('User AOR assignment not found');
    }
    await repo.deactivateAorAssignment(db, params.tenantId, assignmentId, new Date());
  }

  const assignment: AorAssignment = {
    id: randomUUID() as UUID,
    projectId: params.projectId,
    tenantId: params.tenantId,
    userId: params.userId,
    aorNodeId: params.aorNodeId,
    departmentId: null,
    deactivatedAt: null,
    createdAt: new Date(),
  };
  await repo.saveAorAssignment(db, assignment);
  return assignment;
}

export async function deactivateAorUserAssignment(
  repo: ITenancyRepository,
  db: DbClient,
  params: DeactivateAorUserAssignmentParams,
): Promise<AorAssignment> {
  assertSetupActorRole(params.actorRole);

  const assignment = await loadActiveUserAssignment(repo, db, {
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
