import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { performTransition } from './shared';

type FieldStatus = NonNullable<Ticket['pendingFieldStatus']>;
type Context = { tenantId: UUID; ticketId: UUID; actorId: UUID; actorRole: ProjectRole };

export async function submitFieldStatus(repo: ITicketRepository, db: DbClient,
  params: Context & { requestedStatus: FieldStatus; reason?: string }): Promise<Ticket> {
  const reason = params.reason?.trim() || null;
  if (params.requestedStatus === 'DELAYED' && !reason) {
    throw new ValidationError('A delay reason is required');
  }
  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (params.actorRole !== 'INSTRUMENT_MAN' || ticket.assignedInstrumentManId !== params.actorId) {
    throw new ForbiddenError('Only the assigned Instrument Man may submit a field status');
  }
  if (ticket.status !== 'IN_PROGRESS' &&
      !(ticket.status === 'DELAYED' && params.requestedStatus === 'FIELD_CANCELED')) {
    throw new ConflictError('Field status cannot be submitted from this state');
  }
  return performTransition(db, repo, {
    ...params, permittedRoles: ['INSTRUMENT_MAN'], to: 'PENDING_PC_APPROVAL',
    patch: { pendingFieldStatus: params.requestedStatus, pendingFieldReason: reason,
      pendingFieldInitiatedBy: params.actorId,
      ...(params.requestedStatus === 'FIELD_CANCELED'
        ? { cancelInitiatedBy: params.actorId, cancelReason: reason } : {}) },
    eventType: params.requestedStatus === 'FIELD_CANCELED'
      ? 'ticket.field_cancel_requested' : 'ticket.pending_pc_approval',
    eventPayload: { requestedStatus: params.requestedStatus, reason },
  });
}

export async function resolveFieldStatus(repo: ITicketRepository, db: DbClient,
  params: Context & { approve: boolean; reason?: string }): Promise<Ticket> {
  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (ticket.status !== 'PENDING_PC_APPROVAL' || !ticket.pendingFieldStatus) {
    throw new ConflictError('No pending field status to resolve');
  }
  const isChief = params.actorRole === 'PARTY_CHIEF' && ticket.assignedPartyChiefId === params.actorId;
  const isSuperintendent = params.actorRole === 'SURVEY_SUPERINTENDENT' &&
    ticket.surveySuperintendentId === params.actorId;
  const isManager = params.actorRole === 'SURVEY_MANAGER';
  if (!isChief && !isSuperintendent && !isManager) {
    throw new ForbiddenError('Actor is not in this ticket approval chain');
  }
  const finalStatus = params.approve ? ticket.pendingFieldStatus : 'IN_PROGRESS';
  const reason = params.reason?.trim() || null;
  const eventType = !params.approve ? 'ticket.pc_approval_rejected' as const
    : finalStatus === 'FIELD_CANCELED' ? 'ticket.field_canceled' as const
    : 'ticket.pc_approval_given' as const;
  const result = await performTransition(db, repo, {
    ...params, permittedRoles: ['PARTY_CHIEF', 'SURVEY_SUPERINTENDENT', 'SURVEY_MANAGER'],
    to: finalStatus,
    patch: { pendingFieldStatus: null, pendingFieldReason: null, pendingFieldInitiatedBy: null,
      ...(params.approve && (finalStatus === 'COMPLETED' || finalStatus === 'FIELD_CANCELED')
        ? { cancelInitiatedAt: null, cancelInitiatorRole: null } : {}),
      ...(params.approve && finalStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
      ...(params.approve && finalStatus === 'DELAYED'
        ? { delayedReason: ticket.pendingFieldReason } : {}),
      ...(params.approve && finalStatus === 'FIELD_CANCELED'
        ? { canceledAt: new Date(), cancelApprovedBy: params.actorId } : {}),
      ...(!params.approve ? { cancelInitiatedBy: null, cancelReason: null } : {}) },
    eventType,
    additionalEventType: params.approve
      ? finalStatus === 'COMPLETED' ? 'ticket.completed'
        : finalStatus === 'DELAYED' ? 'ticket.delayed' : undefined
      : undefined,
    eventPayload: { finalStatus, responderId: params.actorId,
      requestedStatus: ticket.pendingFieldStatus, reason: reason ?? ticket.pendingFieldReason },
  });
  // In Slim Build there is no Party Chief to override; Survey Manager is the
  // ordinary field-status approver for this ticket.
  if (!isChief && ticket.assignedPartyChiefId) {
    await appendAuditEvent(db, { ticketId: params.ticketId, tenantId: params.tenantId,
      actorId: params.actorId, eventType: 'ticket.pc_approval_overridden',
      payload: { finalStatus, assignedPartyChiefId: ticket.assignedPartyChiefId } });
  }
  return result;
}

export async function restartDelayed(repo: ITicketRepository, db: DbClient,
  params: Context): Promise<Ticket> {
  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!(params.actorRole === 'SURVEY_MANAGER' ||
    params.actorRole === 'SURVEY_SUPERINTENDENT' && ticket.surveySuperintendentId === params.actorId ||
    params.actorRole === 'PARTY_CHIEF' && ticket.assignedPartyChiefId === params.actorId)) {
    throw new ForbiddenError('Actor is not in this ticket approval chain');
  }
  return performTransition(db, repo, { ...params,
    permittedRoles: ['PARTY_CHIEF', 'SURVEY_SUPERINTENDENT', 'SURVEY_MANAGER'],
    to: 'IN_PROGRESS', patch: { delayedReason: null }, eventType: 'ticket.delay_restarted' });
}
