import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';
import { enqueueAssignedFieldNotifications, enqueueRequesterNotification } from './amelia-notifications';

export async function requestSurveyCancel(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
    reason:    string;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  if (!params.reason.trim()) {
    throw new ValidationError('reason is required for survey-side cancellation');
  }

  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);

  if (params.actorRole === 'SURVEY_MANAGER') {
    const canceled = await performTransition(db, repo, {
      tenantId:       params.tenantId,
      ticketId:       params.ticketId,
      actorId:        params.actorId,
      actorRole:      params.actorRole,
      permittedRoles: ['SURVEY_MANAGER'],
      to:             'SURVEY_CANCELED',
      patch:          {
        pendingPcOutcome: null,
        pendingPcReason: null,
        surveyCancelRequestedBy: null,
        surveyCancelRequestedRole: null,
        surveyCancelReason: params.reason.trim(),
        surveyCancelRequestedAt: null,
        assignedPartyChiefId: null,
        assignedInstrumentManId: null,
        fieldValidationReviewerId: null,
      },
      eventType:    'ticket.survey_canceled',
      eventPayload: { reason: params.reason, approverRole: params.actorRole },
      visibility:   params.visibility,
    });

    if (ticket.status === 'IN_PROGRESS') {
      await appendAuditEvent(db, {
        ticketId: params.ticketId,
        tenantId: params.tenantId,
        actorId: params.actorId,
        eventType: 'ticket.im_stop_work_notified',
        payload: { reason: params.reason },
      });
    }

    await db.query(
      `UPDATE ticket_assignment_history
       SET ended_at = NOW(), end_reason = 'SURVEY_CANCELED'
       WHERE tenant_id = $1 AND ticket_id = $2 AND ended_at IS NULL`,
      [params.tenantId, params.ticketId],
    );
    await enqueueRequesterNotification(db, {
      tenantId: params.tenantId,
      ticketId: params.ticketId,
      requesterId: ticket.requesterId,
      eventType: 'SURVEY_CANCELED',
      payload: { reason: params.reason.trim() },
      idempotencyKey: `${params.ticketId}:survey-canceled`,
    });
    await enqueueAssignedFieldNotifications(db, {
      tenantId: params.tenantId,
      ticketId: params.ticketId,
      assignedPartyChiefId: ticket.assignedPartyChiefId,
      assignedInstrumentManId: ticket.assignedInstrumentManId,
      eventType: 'STOP_WORK_CANCELED',
      payload: { reason: params.reason.trim() },
      idempotencyKey: `${params.ticketId}:survey-canceled:field`,
    });

    return canceled;
  }

  if (params.actorRole !== 'PARTY_CHIEF' && params.actorRole !== 'INSTRUMENT_MAN') {
    throw new ForbiddenError('Only assigned field staff or survey leadership may flag stop-work');
  }
  if (params.actorRole === 'INSTRUMENT_MAN' && ticket.assignedInstrumentManId !== params.actorId) {
    throw new ForbiddenError('Instrument Man may only flag their own assigned SWR');
  }

  if (ticket.surveyCancelRequestedAt) {
    throw new ConflictError('A survey-side cancellation request is already pending');
  }

  await repo.patchTicket(db, params.tenantId, params.ticketId, {
    status: ticket.status,
    surveyCancelRequestedBy: params.actorId,
    surveyCancelRequestedRole: params.actorRole,
    surveyCancelReason: params.reason,
    surveyCancelRequestedAt: new Date(),
  }, {
    expectedStatus: ticket.status,
    expectedRowVersion: ticket.rowVersion,
  });

  await appendAuditEvent(db, {
    ticketId: params.ticketId,
    tenantId: params.tenantId,
    actorId: params.actorId,
    eventType: 'ticket.survey_cancel_requested',
    payload: {
      requestedByRole: params.actorRole,
      reason: params.reason,
    },
  });

  return {
    ...ticket,
    surveyCancelRequestedBy: params.actorId,
    surveyCancelRequestedRole: params.actorRole,
    surveyCancelReason: params.reason,
    surveyCancelRequestedAt: new Date(),
    rowVersion: (ticket.rowVersion ?? 0) + 1,
    updatedAt: new Date(),
  };
}
