/**
 * ApproveTicket — SUBMITTED → APPROVED.
 * Permitted actor: SURVEY_MANAGER.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { ForbiddenError } from '@/shared/errors';
import { performTransition } from './shared';

export async function approveTicket(
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
    permittedRoles: ['SURVEY_MANAGER'],
    authorizeTicket: (ticket) => {
      if (ticket.requesterId === params.actorId ||
          ticket.surveyLeadId === params.actorId ||
          ticket.surveyManagerId === params.actorId) {
        throw new ForbiddenError('Cannot approve your own ticket');
      }
    },
    to:             'APPROVED',
    patch:          { approvedAt: new Date() },
    eventType:      'ticket.approved',
  });
}
