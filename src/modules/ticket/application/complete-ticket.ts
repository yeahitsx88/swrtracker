/**
 * CompleteTicket — IN_PROGRESS → COMPLETED.
 * Amelia completion is final when submitted by the assigned Instrument Man.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';
import { ForbiddenError, NotFoundError } from '@/shared/errors';
import { enqueueRequesterNotification } from './amelia-notifications';

export async function completeTicket(
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
  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);
  if (params.actorRole !== 'INSTRUMENT_MAN' || ticket.assignedInstrumentManId !== params.actorId) {
    throw new ForbiddenError('Only the assigned Instrument Man may complete this SWR');
  }
  const completedAt = new Date();
  const completed = await performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['INSTRUMENT_MAN'],
    to:             'COMPLETED',
    patch:          {
      completedAt,
      pendingPcOutcome: null,
      pendingPcReason: null,
    },
    eventType:    'ticket.completed',
    eventPayload: { completedAt: completedAt.toISOString() },
    visibility:   params.visibility,
  });
  await enqueueRequesterNotification(db, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    requesterId: ticket.requesterId,
    eventType: 'COMPLETED',
    payload: { completedAt: completedAt.toISOString() },
    idempotencyKey: `${params.ticketId}:completed`,
  });
  await db.query(
    `UPDATE ticket_assignment_history
     SET ended_at = NOW(), end_reason = 'COMPLETED'
     WHERE tenant_id = $1 AND ticket_id = $2 AND ended_at IS NULL`,
    [params.tenantId, params.ticketId],
  );
  return completed;
}
