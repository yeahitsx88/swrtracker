import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import { assessSurveyManagerRemoval, recordSurveyManagerRemovalBlocked,
  issueSurveyManagerVacancyGrant } from '@/modules/tenancy/application/project-continuity';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import type { DbClient, UUID } from '@/shared/types';
import { UserLifecycleRepository } from '../infrastructure/user-lifecycle.repository';

export type DeactivationResult = { deactivated: true; draftCount: number;
  orphanedTicketCount: number } | { deactivated: false;
  blockedProjects: Array<{ id: UUID; name: string }> };

/** Caller must commit this result before turning a blocked result into HTTP 403. */
export async function deactivateUser(repo: UserLifecycleRepository,
  tenancy: ITenancyRepository, db: DbClient, params: {
    tenantId: UUID; userId: UUID; actorId: UUID; actorRole: string;
  }): Promise<DeactivationResult> {
  if (params.actorRole !== 'TENANT_ADMIN') throw new ForbiddenError('Tenant Admin required');
  const user = await repo.lockUser(db, params.tenantId, params.userId);
  if (!user) throw new NotFoundError('User not found');
  if (user.deactivatedAt) throw new ConflictError('User is already deactivated');
  const assessment = await assessSurveyManagerRemoval(tenancy, db, params);
  if (assessment.blockedProjects.length) {
    await recordSurveyManagerRemovalBlocked(tenancy, db, {
      ...params, blockedProjects: assessment.blockedProjects,
    });
    return { deactivated: false, blockedProjects: assessment.blockedProjects };
  }
  const [roles, orphaned] = await Promise.all([
    repo.affectedRoles(db, params.tenantId, params.userId),
    repo.orphanedTickets(db, params.tenantId, params.userId),
  ]);
  const draftIds = await repo.softDeleteDrafts(db, params.tenantId, params.userId);
  for (const ticketId of draftIds) {
    await appendAuditEvent(db, { ticketId, tenantId: params.tenantId,
      actorId: params.actorId, eventType: 'ticket.draft_deleted',
      payload: { reason: 'USER_DEACTIVATED', userId: params.userId } });
  }
  await repo.deactivateDependencies(db, params.tenantId, params.userId);
  await repo.setDeactivated(db, params.tenantId, params.userId, params.actorId);
  for (const item of orphaned) {
    await appendAuditEvent(db, { ticketId: item.id, tenantId: params.tenantId,
      actorId: params.actorId, eventType: 'ticket.assignment_orphaned',
      payload: { deactivatedUserId: params.userId,
        roleOnTicket: item.roleOnTicket, ticketStatus: item.status } });
  }
  for (const projectId of assessment.coveredProjectIds) {
    await issueSurveyManagerVacancyGrant(tenancy, db, {
      tenantId: params.tenantId, projectId, vacatedUserId: params.userId,
      actorId: params.actorId, reason: 'Survey Manager deactivated',
    });
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'user.deactivated', { userId: params.userId,
      deactivatedBy: params.actorId, affectedOpenTicketCount: orphaned.length,
      affectedRoles: roles });
  return { deactivated: true, draftCount: draftIds.length,
    orphanedTicketCount: orphaned.length };
}

export async function reactivateUser(repo: UserLifecycleRepository, db: DbClient,
  params: { tenantId: UUID; userId: UUID; actorId: UUID; actorRole: string }): Promise<void> {
  if (params.actorRole !== 'TENANT_ADMIN') throw new ForbiddenError('Tenant Admin required');
  const user = await repo.lockUser(db, params.tenantId, params.userId);
  if (!user) throw new NotFoundError('User not found');
  if (!user.deactivatedAt) throw new ConflictError('User is already active');
  await repo.setReactivated(db, params.tenantId, params.userId);
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'user.reactivated', { userId: params.userId, reactivatedBy: params.actorId });
}

export async function changeProjectMembership(repo: UserLifecycleRepository,
  tenancy: ITenancyRepository, db: DbClient, params: {
    tenantId: UUID; projectId: UUID; userId: UUID; actorId: UUID;
    actorRole: string; newRole: string | null;
  }): Promise<{ changed: boolean;
  blockedProjects?: Array<{ id: UUID; name: string }> }> {
  const membership = await repo.lockProjectMembership(db, params.tenantId,
    params.projectId, params.userId);
  if (!membership) throw new NotFoundError('Project member not found');
  if (membership.projectStatus === 'ARCHIVED') {
    throw new ConflictError('Archived project is read-only');
  }
  if (params.actorRole !== 'TENANT_ADMIN' &&
      !(params.actorRole === 'PROJECT_ADMIN' && membership.projectStatus === 'SETUP')) {
    throw new ForbiddenError('Tenant Admin or SETUP Project Admin required');
  }
  if (params.newRole === membership.role) return { changed: false };
  if (membership.role === 'SURVEY_MANAGER' && params.newRole !== 'SURVEY_MANAGER' &&
      membership.projectStatus === 'ACTIVE') {
    const assessment = await assessSurveyManagerRemoval(tenancy, db, params);
    const blocked = assessment.blockedProjects.filter(project => project.id === params.projectId);
    if (blocked.length) {
      await recordSurveyManagerRemovalBlocked(tenancy, db, {
        ...params, blockedProjects: blocked,
      });
      return { changed: false, blockedProjects: blocked };
    }
    if (assessment.coveredProjectIds.includes(params.projectId)) {
      await issueSurveyManagerVacancyGrant(tenancy, db, {
        tenantId: params.tenantId, projectId: params.projectId,
        vacatedUserId: params.userId, actorId: params.actorId,
        reason: 'Survey Manager role changed',
      });
    }
  }
  if (params.newRole === null) {
    const draftIds = await repo.softDeleteProjectDrafts(db, params.tenantId,
      params.projectId, params.userId);
    for (const ticketId of draftIds) {
      await appendAuditEvent(db, { ticketId, tenantId: params.tenantId,
        actorId: params.actorId, eventType: 'ticket.draft_deleted',
        payload: { reason: 'USER_DEACTIVATED',
          projectRemoval: true, userId: params.userId } });
    }
    await repo.removeProjectMember(db, params.tenantId,
      params.projectId, params.userId);
  } else {
    await repo.changeProjectRole(db, params.tenantId, params.projectId,
      params.userId, params.newRole);
  }
  await db.query(`INSERT INTO tenant_events(tenant_id,actor_id,event_type,payload)
    VALUES($1,$2,'user.role_changed',$3)`, [params.tenantId, params.actorId,
    JSON.stringify({ projectId: params.projectId, userId: params.userId,
      oldRole: membership.role, newRole: params.newRole,
      changedBy: params.actorId })]);
  return { changed: true };
}
