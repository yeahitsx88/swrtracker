import { ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';
import { enqueueRequesterNotification } from './amelia-notifications';

export async function requesterCancel(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  if (params.actorRole !== 'REQUESTER') {
    throw new ForbiddenError('Only REQUESTER may self-cancel a ticket');
  }

  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);

  if (ticket.requesterId !== params.actorId) {
    throw new ForbiddenError('You can only cancel your own tickets');
  }

  const canceled = await performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['REQUESTER'],
    to:             'REQUESTER_CANCELED',
    patch:          {
      pendingPcOutcome: null,
      pendingPcReason: null,
      assignedPartyChiefId: null,
      assignedInstrumentManId: null,
      fieldValidationReviewerId: null,
    },
    eventType:      'ticket.requester_canceled',
    visibility:     params.visibility,
  });
  await db.query(
    `UPDATE ticket_assignment_history
     SET ended_at = NOW(), end_reason = 'REQUESTER_CANCELED'
     WHERE tenant_id = $1 AND ticket_id = $2 AND ended_at IS NULL`,
    [params.tenantId, params.ticketId],
  );
  await enqueueRequesterNotification(db, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    requesterId: ticket.requesterId,
    eventType: 'REQUESTER_CANCELED',
    idempotencyKey: `${params.ticketId}:requester-canceled`,
  });
  return canceled;
}
