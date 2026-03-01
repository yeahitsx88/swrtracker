/**
 * CompleteTicket — IN_PROGRESS → COMPLETED.
 * Permitted actors: PARTY_CHIEF, INSTRUMENT_MAN, SURVEY_LEAD.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { performTransition } from './shared';

export async function completeTicket(
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
    to:             'COMPLETED',
    patch:          { completedAt: new Date() },
    eventType:      'ticket.completed',
  });
}
