import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { ITenancyRepository } from './ports';

interface Context {
  tenantId: UUID;
  projectId: UUID;
  actorId: UUID;
  actorRole: ProjectRole | TenantRole;
}

async function requireActiveProject(repo: ITenancyRepository, db: DbClient,
  params: Context, allowSetup = false): Promise<void> {
  const project = await repo.lockProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status !== 'ACTIVE' && !(allowSetup && project.status === 'SETUP')) {
    throw new ConflictError(allowSetup
      ? 'Project must be SETUP or ACTIVE' : 'Project must be ACTIVE');
  }
}

function isConfigAdmin(role: Context['actorRole']): boolean {
  return role === 'TENANT_ADMIN' || role === 'PROJECT_ADMIN';
}

async function authorizeAssignment(
  repo: ITenancyRepository, db: DbClient, params: Context,
  subject: { userId: UUID | null; departmentId: UUID | null; role: string | null },
  nodeIds: UUID[],
): Promise<void> {
  if (subject.departmentId) {
    if (!isConfigAdmin(params.actorRole)) {
      throw new ForbiddenError('Project configuration administrator required');
    }
    return;
  }
  if (subject.role === 'SURVEY_SUPERINTENDENT') {
    if (params.actorRole !== 'SURVEY_MANAGER' && !isConfigAdmin(params.actorRole)) {
      throw new ForbiddenError('Survey Manager required for Superintendent AOR assignment');
    }
    return;
  }
  if (subject.role === 'PARTY_CHIEF') {
    if (params.actorRole === 'SURVEY_MANAGER' || isConfigAdmin(params.actorRole)) return;
    if (params.actorRole === 'SURVEY_SUPERINTENDENT') {
      for (const nodeId of nodeIds) {
        if (!(await repo.isNodeWithinActorScope(
          db, params.tenantId, params.projectId, params.actorId, nodeId,
        ))) throw new ForbiddenError('Party Chief AOR must be within Superintendent scope');
      }
      return;
    }
    throw new ForbiddenError('Survey Manager or scoped Superintendent required');
  }
  if (!isConfigAdmin(params.actorRole)) {
    throw new ForbiddenError('Project configuration administrator required');
  }
}

export async function retireAorNode(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { nodeId: UUID },
): Promise<void> {
  if (!isConfigAdmin(params.actorRole)) {
    throw new ForbiddenError('Project configuration administrator required');
  }
  await requireActiveProject(repo, db, params);
  const node = await repo.findAorNodeForOperation(
    db, params.tenantId, params.projectId, params.nodeId,
  );
  if (!node) throw new NotFoundError('AOR node not found');
  if (node.retiredAt) throw new ConflictError('AOR node is already retired');
  if (!(await repo.retireAorNode(
    db, params.tenantId, params.projectId, params.nodeId,
  ))) {
    throw new ConflictError('AOR node has active descendants, assignments, tickets, or is the last active node');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'aor.node_retired', { projectId: params.projectId,
      nodeId: params.nodeId, nodeCode: node.code,
      retiredBy: params.actorId });
}

export async function assignAorScope(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { nodeId: UUID; userId: UUID | null;
    departmentId: UUID | null },
): Promise<UUID> {
  if ((params.userId === null) === (params.departmentId === null)) {
    throw new ConflictError('Exactly one AOR assignment subject is required');
  }
  await requireActiveProject(repo, db, params, true);
  const node = await repo.findAorNodeForOperation(
    db, params.tenantId, params.projectId, params.nodeId,
  );
  if (!node || node.retiredAt) throw new NotFoundError('Active AOR node not found');
  const role = params.userId ? await repo.findEligibleAorUserRole(
    db, params.tenantId, params.projectId, params.userId,
  ) : null;
  if (params.userId && !role) throw new NotFoundError('Eligible project member not found');
  if (params.departmentId && !(await repo.isActiveProjectDepartment(
    db, params.tenantId, params.projectId, params.departmentId,
  ))) throw new NotFoundError('Project department not found');
  await authorizeAssignment(repo, db, params,
    { userId: params.userId, departmentId: params.departmentId, role },
    [params.nodeId]);
  const assignmentId = await repo.assignAorScope(db,
    params.tenantId, params.projectId, params.nodeId,
    params.userId, params.departmentId,
  );
  if (!assignmentId) throw new ConflictError('AOR assignment is invalid or already active');
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    params.departmentId ? 'department.aor_assigned' : 'aor.node_assigned',
    { projectId: params.projectId, assignmentId,
      nodeId: params.nodeId, userId: params.userId,
      departmentId: params.departmentId });
  return assignmentId;
}

export async function moveAorAssignment(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { assignmentId: UUID; nodeId: UUID },
): Promise<void> {
  await requireActiveProject(repo, db, params, true);
  const assignment = await repo.findAorAssignment(
    db, params.tenantId, params.projectId, params.assignmentId,
  );
  if (!assignment || assignment.deactivatedAt) {
    throw new NotFoundError('Active AOR assignment not found');
  }
  const node = await repo.findAorNodeForOperation(
    db, params.tenantId, params.projectId, params.nodeId,
  );
  if (!node || node.retiredAt) throw new NotFoundError('Active AOR node not found');
  if (assignment.nodeId === params.nodeId) throw new ConflictError('AOR assignment is already at this node');
  if (assignment.userId && !(await repo.findEligibleAorUserRole(
    db, params.tenantId, params.projectId, assignment.userId,
  ))) throw new ConflictError('Assigned user no longer has an eligible active role');
  if (assignment.departmentId && !(await repo.isActiveProjectDepartment(
    db, params.tenantId, params.projectId, assignment.departmentId,
  ))) throw new ConflictError('Assigned department no longer belongs to this project');
  await authorizeAssignment(repo, db, params, assignment,
    [assignment.nodeId, params.nodeId]);
  if (!(await repo.moveAorAssignment(
    db, params.tenantId, params.projectId, params.assignmentId, params.nodeId,
  ))) throw new ConflictError('AOR assignment changed concurrently');
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    assignment.departmentId ? 'department.aor_assigned' : 'aor.node_assigned',
    { projectId: params.projectId, assignmentId: params.assignmentId,
      previousNodeId: assignment.nodeId, nodeId: params.nodeId,
      userId: assignment.userId, departmentId: assignment.departmentId });
}

async function authorizeRoster(
  repo: ITenancyRepository, db: DbClient, params: Context,
  partyChiefId: UUID,
): Promise<void> {
  if (params.actorRole === 'SURVEY_MANAGER') return;
  if (params.actorRole !== 'SURVEY_SUPERINTENDENT') {
    throw new ForbiddenError('Survey Manager or Superintendent required');
  }
  if (!(await repo.canSuperintendentManagePartyChief(
    db, params.tenantId, params.projectId, params.actorId, partyChiefId,
  ))) throw new ForbiddenError('Party Chief is outside Superintendent AOR scope');
}

export async function setCrewRoster(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { partyChiefId: UUID; instrumentManId: UUID },
): Promise<UUID> {
  await requireActiveProject(repo, db, params, true);
  await authorizeRoster(repo, db, params, params.partyChiefId);
  const previous = await repo.findCrewRoster(
    db, params.tenantId, params.projectId, params.instrumentManId,
  );
  if (previous?.deactivatedAt === null && previous.partyChiefId === params.partyChiefId) {
    throw new ConflictError('Instrument Man is already on this active crew');
  }
  const rosterId = await repo.saveCrewRoster(
    db, params.tenantId, params.projectId,
    params.partyChiefId, params.instrumentManId,
  );
  if (!rosterId) throw new NotFoundError('Active Party Chief or Instrument Man membership not found');
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'crew.roster_changed', { projectId: params.projectId,
      rosterId, instrumentManId: params.instrumentManId,
      previousPartyChiefId: previous?.partyChiefId ?? null,
      partyChiefId: params.partyChiefId,
      action: previous ? (previous.deactivatedAt ? 'REACTIVATED' : 'REASSIGNED') : 'CREATED' });
  return rosterId;
}

export async function deactivateCrewRoster(
  repo: ITenancyRepository, db: DbClient,
  params: Context & { instrumentManId: UUID },
): Promise<void> {
  await requireActiveProject(repo, db, params, true);
  const previous = await repo.findCrewRoster(
    db, params.tenantId, params.projectId, params.instrumentManId,
  );
  if (!previous || previous.deactivatedAt) {
    throw new NotFoundError('Active crew roster entry not found');
  }
  await authorizeRoster(repo, db, params, previous.partyChiefId);
  if (!(await repo.deactivateCrewRoster(
    db, params.tenantId, params.projectId, params.instrumentManId,
  ))) throw new ConflictError('Crew roster changed concurrently');
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'crew.roster_changed', { projectId: params.projectId,
      rosterId: previous.id, instrumentManId: params.instrumentManId,
      previousPartyChiefId: previous.partyChiefId,
      partyChiefId: null, action: 'DEACTIVATED' });
}
