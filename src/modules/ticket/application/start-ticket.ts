/**
 * StartTicket — ASSIGNED → IN_PROGRESS.
 * The assigned Instrument Man starts Amelia field work.
 * Requester is notified on this event (CLAUDE.md §9).
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';
import { ForbiddenError, NotFoundError } from '@/shared/errors';

export async function startTicket(
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
    throw new ForbiddenError('Only the assigned Instrument Man may start this SWR');
  }
  return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['INSTRUMENT_MAN'],
    to:             'IN_PROGRESS',
    patch:          { startedAt: new Date() },
    eventType:      'ticket.in_progress',
    visibility:     params.visibility,
    // NOTE: requester notification on this event is required (CLAUDE.md §9).
    // Notification module will subscribe to ticket.in_progress events in Phase 4.
  });
}
