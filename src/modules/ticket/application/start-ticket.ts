/**
 * StartTicket — ASSIGNED → IN_PROGRESS.
 * Permitted actors: PARTY_CHIEF, INSTRUMENT_MAN, SURVEY_LEAD.
 * Requester is notified on this event (CLAUDE.md §9).
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { performTransition } from './shared';

export async function startTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
  },
): Promise<Ticket> {
  return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['PARTY_CHIEF', 'INSTRUMENT_MAN', 'SURVEY_LEAD'],
    to:             'IN_PROGRESS',
    patch:          { startedAt: new Date() },
    eventType:      'ticket.in_progress',
    // NOTE: requester notification on this event is required (CLAUDE.md §9).
    // Notification module will subscribe to ticket.in_progress events in Phase 4.
  });
}
