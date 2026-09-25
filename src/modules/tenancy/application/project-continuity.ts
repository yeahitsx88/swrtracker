import { randomUUID } from 'crypto';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { ActingGrant } from '../domain/types';
import type { ITenancyRepository } from './ports';
import { assertProjectConfigAdmin } from './shared';

interface ProjectContext {
  tenantId: UUID;
  projectId: UUID;
  actorId: UUID;
  actorRole: ProjectRole | TenantRole;
}

export async function inspectProjectContinuity(
  repo: ITenancyRepository, db: DbClient, params: ProjectContext,
): Promise<{ designatedActingSurveyManagerId: UUID | null; activeGrants: ActingGrant[] }> {
  assertProjectConfigAdmin(params.actorRole);
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  const [designatedActingSurveyManagerId, activeGrants] = await Promise.all([
    repo.findActingDesignee(db, params.tenantId, params.projectId),
    repo.listActiveActingGrants(db, params.tenantId, params.projectId),
  ]);
  return { designatedActingSurveyManagerId, activeGrants };
}

export async function designateActingSurveyManager(
  repo: ITenancyRepository, db: DbClient,
  params: ProjectContext & { userId: UUID | null },
): Promise<void> {
  assertProjectConfigAdmin(params.actorRole);
  const project = await repo.lockProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');
  if (params.userId && !(await repo.isEligibleActingDesignee(
    db, params.tenantId, params.projectId, params.userId,
  ))) throw new ConflictError('Acting designee must be an active survey crew member in this project');
  const previousUserId = await repo.findActingDesignee(db, params.tenantId, params.projectId);
  if (previousUserId === params.userId) return;
  await repo.setActingDesignee(db, params.tenantId, params.projectId, params.userId);
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'acting_designee.changed', { projectId: params.projectId,
      role: 'SURVEY_MANAGER', previousUserId,
      designatedUserId: params.userId, actorId: params.actorId });
}

export async function archiveProject(
  repo: ITenancyRepository, db: DbClient, params: ProjectContext,
): Promise<number> {
  if (params.actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only TENANT_ADMIN may archive projects');
  }
  const project = await repo.lockProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status !== 'ACTIVE') throw new ConflictError('Only ACTIVE projects may be archived');
  const openTicketCount = await repo.archiveProject(
    db, params.tenantId, params.projectId, params.actorId,
  );
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'project.archived', { projectId: params.projectId,
      archivedBy: params.actorId, openTicketCount });
  return openTicketCount;
}

export async function confirmActingGrant(
  repo: ITenancyRepository, db: DbClient,
  params: ProjectContext & { grantId: UUID },
): Promise<void> {
  assertProjectConfigAdmin(params.actorRole);
  const project = await repo.lockProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');
  const grant = await repo.findActingGrant(db, params.tenantId, params.projectId, params.grantId);
  if (!grant) throw new NotFoundError('Acting grant not found');
  if (grant.role !== 'SURVEY_MANAGER' ||
      grant.scope.projectId !== params.projectId ||
      !Array.isArray(grant.scope.actions) ||
      !grant.scope.actions.includes('manage_workflow')) {
    throw new ConflictError('Acting grant role or scope is invalid');
  }
  if (grant.revokedAt || grant.confirmedAt) throw new ConflictError('Acting grant is no longer pending confirmation');
  if (!(await repo.listActiveActingGrants(db,
    params.tenantId, params.projectId)).some((active) => active.id === grant.id)) {
    throw new ConflictError('Acting grant holder is no longer active or eligible');
  }
  if (!(await repo.confirmActingGrant(
    db, params.tenantId, params.projectId, params.grantId, params.actorId,
  ))) throw new ConflictError('Acting grant confirmation conflicted with another update');
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'acting_grant.confirmed', { projectId: params.projectId,
      grantId: params.grantId, actingUserId: grant.userId,
      confirmedBy: params.actorId });
}

export async function revokeActingGrant(
  repo: ITenancyRepository, db: DbClient,
  params: ProjectContext & { grantId: UUID; permanentReplacementId: UUID },
): Promise<void> {
  assertProjectConfigAdmin(params.actorRole);
  const project = await repo.lockProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');
  const grant = await repo.findActingGrant(db, params.tenantId, params.projectId, params.grantId);
  if (!grant) throw new NotFoundError('Acting grant not found');
  if (grant.revokedAt) throw new ConflictError('Acting grant is already revoked');
  if (!(await repo.isActiveSurveyManager(
    db, params.tenantId, params.projectId, params.permanentReplacementId,
  ))) throw new ConflictError('Permanent replacement must be an active Survey Manager on this project');
  if (!(await repo.revokeActingGrant(
    db, params.tenantId, params.projectId, params.grantId, params.actorId,
  ))) throw new ConflictError('Acting grant revocation conflicted with another update');
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'acting_grant.revoked', { projectId: params.projectId,
      grantId: params.grantId, actingUserId: grant.userId,
      revokedBy: params.actorId,
      permanentReplacementId: params.permanentReplacementId });
}

export async function assessSurveyManagerRemoval(
  repo: ITenancyRepository, db: DbClient,
  params: { tenantId: UUID; userId: UUID },
): Promise<{ coveredProjectIds: UUID[]; blockedProjects: Array<{ id: UUID; name: string }> }> {
  const projects = await repo.listSurveyManagerRemovalProjects(db, params.tenantId, params.userId);
  return {
    coveredProjectIds: projects.filter((p) => !p.hasOtherManager && p.hasActingCoverage)
      .map((p) => p.id),
    blockedProjects: projects.filter((p) => !p.hasOtherManager && !p.hasActingCoverage)
      .map((p) => ({ id: p.id, name: p.name })),
  };
}

export async function recordSurveyManagerRemovalBlocked(
  repo: ITenancyRepository, db: DbClient,
  params: { tenantId: UUID; actorId: UUID; userId: UUID;
    blockedProjects: Array<{ id: UUID; name: string }> },
): Promise<void> {
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'user.removal_blocked', { userId: params.userId,
      role: 'SURVEY_MANAGER', reason: 'SURVEY_MANAGER_NO_REPLACEMENT',
      affectedProjects: params.blockedProjects });
}

export async function issueSurveyManagerVacancyGrant(
  repo: ITenancyRepository, db: DbClient,
  params: { tenantId: UUID; projectId: UUID; vacatedUserId: UUID;
    actorId: UUID; reason: string },
): Promise<ActingGrant | null> {
  const project = await repo.lockProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status !== 'ACTIVE') return null;
  const existing = (await repo.listActiveActingGrants(
    db, params.tenantId, params.projectId,
  )).find((grant) => grant.role === 'SURVEY_MANAGER');
  if (existing) return existing;
  const candidate = await repo.findEligibleActingCandidate(
    db, params.tenantId, params.projectId, params.vacatedUserId,
  );
  if (!candidate) {
    await repo.appendTenantEvent(db, params.tenantId, params.actorId,
      'vacancy.no_survey_personnel', { projectId: params.projectId,
        vacatedUserId: params.vacatedUserId });
    return null;
  }
  const grant: ActingGrant = {
    id: randomUUID() as UUID, tenantId: params.tenantId,
    projectId: params.projectId, userId: candidate.userId,
    role: 'SURVEY_MANAGER',
    scope: { actions: ['approve', 'reject', 'assign_crew', 'manage_workflow'],
      projectId: params.projectId },
    trigger: candidate.cascadeLevel === 0 ? 'VACANCY' : 'CASCADE',
    cascadeLevel: candidate.cascadeLevel, grantedReason: params.reason,
    confirmedBy: null, confirmedAt: null, revokedBy: null, revokedAt: null,
    createdAt: new Date(),
  };
  if (!(await repo.issueActingGrant(db, grant))) {
    throw new ConflictError('Acting candidate is no longer an active survey crew member');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'acting_grant.issued', { projectId: params.projectId,
      grantId: grant.id, userId: grant.userId,
      role: grant.role, trigger: grant.trigger,
      cascadeLevel: grant.cascadeLevel, scope: grant.scope,
      vacatedUserId: params.vacatedUserId });
  return grant;
}
