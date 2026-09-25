import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { ITicketRepository, VisibilityScope } from './ports';
import type { Ticket } from '../domain/types';

/** Caller must provide a transaction: the snapshot and its audit event are atomic. */
export async function reassignSuperintendent(repo: ITicketRepository, db: DbClient,
  params: { tenantId: UUID; ticketId: UUID; actor: VisibilityScope;
    superintendentId: UUID; reason: string }): Promise<Ticket> {
  if (params.actor.actorRole !== 'SURVEY_MANAGER') {
    throw new ForbiddenError('Survey Manager required to reassign Superintendent');
  }
  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket || (params.actor.companyType === 'SUBCONTRACTOR' &&
      params.actor.companyId !== ticket.companyId)) throw new NotFoundError('Ticket not found');
  if (!['ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED'].includes(ticket.status)) {
    throw new ConflictError('Ticket is not in a reassignable state');
  }
  if (await repo.findActiveProjectCrewBuild(db, params.tenantId, ticket.projectId) !== 'FULL') {
    throw new ConflictError('An active Full Build project is required');
  }
  const reason = params.reason.trim();
  if (!reason || reason.length > 500) throw new ValidationError('Reassignment reason must be 1-500 characters');
  if (ticket.surveySuperintendentId === params.superintendentId) {
    throw new ConflictError('Superintendent assignment is unchanged');
  }
  if (!ticket.aorNodeId || !await repo.isAorNodeInSurveyRoleScope(db, params.tenantId,
    ticket.projectId, params.superintendentId, ticket.aorNodeId, 'SURVEY_SUPERINTENDENT')) {
    throw new ForbiddenError('Replacement must be an active Superintendent covering the ticket AOR');
  }
  await repo.patchTicket(db, params.tenantId, ticket.id, {
    status: ticket.status, surveySuperintendentId: params.superintendentId,
  });
  await appendAuditEvent(db, { tenantId: params.tenantId, ticketId: ticket.id,
    actorId: params.actor.actorId, eventType: 'ticket.superintendent_reassigned', payload: {
      oldSuperintendentId: ticket.surveySuperintendentId,
      newSuperintendentId: params.superintendentId, reason, status: ticket.status,
    } });
  return { ...ticket, surveySuperintendentId: params.superintendentId, updatedAt: new Date() };
}
