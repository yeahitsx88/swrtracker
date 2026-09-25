import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { performTransition } from './shared';

type Context = { tenantId: UUID; ticketId: UUID; actorId: UUID; actorRole: ProjectRole };
const terminal = new Set(['DRAFT', 'COMPLETED', 'REQUESTER_CANCELED',
  'FIELD_CANCELED', 'SURVEY_CANCELED']);

export async function initiateSurveyCancel(repo: ITicketRepository, db: DbClient,
  params: Context & { reason: string }): Promise<Ticket> {
  const reason = params.reason.trim();
  if (!reason) throw new ValidationError('A written cancellation reason is required');
  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (terminal.has(ticket.status)) throw new ConflictError('Ticket cannot be canceled');
  if (ticket.cancelInitiatedAt) throw new ConflictError('Cancellation already pending');
  if (params.actorRole === 'SURVEY_MANAGER') {
    return performTransition(db, repo, { ...params, permittedRoles: ['SURVEY_MANAGER'],
      to: 'SURVEY_CANCELED', patch: { canceledAt: new Date(), cancelReason: reason,
        cancelInitiatedBy: params.actorId, cancelApprovedBy: params.actorId,
        pendingFieldStatus: null, pendingFieldReason: null, pendingFieldInitiatedBy: null },
      eventType: 'ticket.survey_canceled',
      eventPayload: { reason, initiatorId: params.actorId, approverId: params.actorId,
        priorStatus: ticket.status } });
  }
  const isChief = params.actorRole === 'PARTY_CHIEF' && ticket.assignedPartyChiefId === params.actorId;
  const isSuperintendent = params.actorRole === 'SURVEY_SUPERINTENDENT' &&
    ticket.surveySuperintendentId === params.actorId;
  if (!isChief && !isSuperintendent) {
    throw new ForbiddenError('Actor is not in this ticket cancellation chain');
  }
  const initiatedAt = new Date();
  await repo.patchTicket(db, params.tenantId, params.ticketId, {
    status: ticket.status, cancelReason: reason, cancelInitiatedBy: params.actorId,
    cancelInitiatedAt: initiatedAt, cancelInitiatorRole: params.actorRole,
  });
  await appendAuditEvent(db, { ticketId: params.ticketId, tenantId: params.tenantId,
    actorId: params.actorId, eventType: 'ticket.survey_cancel_requested',
    payload: { reason, initiatorRole: params.actorRole } });
  return { ...ticket, cancelReason: reason, cancelInitiatedBy: params.actorId,
    cancelInitiatedAt: initiatedAt, cancelInitiatorRole: params.actorRole, updatedAt: initiatedAt };
}

export async function approveSurveyCancel(repo: ITicketRepository, db: DbClient,
  params: Context): Promise<Ticket> {
  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (terminal.has(ticket.status) || !ticket.cancelInitiatedAt ||
      !ticket.cancelInitiatedBy || !ticket.cancelReason) {
    throw new ConflictError('No active survey cancellation to approve');
  }
  const allowed = params.actorRole === 'SURVEY_MANAGER' ||
    ticket.cancelInitiatorRole === 'PARTY_CHIEF' &&
    params.actorRole === 'SURVEY_SUPERINTENDENT' &&
    ticket.surveySuperintendentId === params.actorId;
  if (!allowed || params.actorId === ticket.cancelInitiatedBy) {
    throw new ForbiddenError('Actor cannot approve this survey cancellation');
  }
  return performTransition(db, repo, { ...params,
    permittedRoles: ['SURVEY_SUPERINTENDENT', 'SURVEY_MANAGER'],
    to: 'SURVEY_CANCELED', patch: { canceledAt: new Date(),
      cancelApprovedBy: params.actorId, pendingFieldStatus: null,
      pendingFieldReason: null, pendingFieldInitiatedBy: null },
    eventType: 'ticket.survey_canceled',
    eventPayload: { reason: ticket.cancelReason, initiatorId: ticket.cancelInitiatedBy,
      approverId: params.actorId, priorStatus: ticket.status },
    authorizeTicket: current => {
      if (!current.cancelInitiatedAt || current.cancelInitiatedBy !== ticket.cancelInitiatedBy) {
        throw new ConflictError('Cancellation request changed');
      }
    },
  });
}
