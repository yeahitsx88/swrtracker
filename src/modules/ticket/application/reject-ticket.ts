/**
 * RejectTicket — SUBMITTED → REJECTED.
 * Requires a written rejection reason before the transition completes.
 * Permitted actor: SURVEY_MANAGER.
 */
import { ForbiddenError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { performTransition } from './shared';

export async function rejectTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:        UUID;
    ticketId:        UUID;
    actorId:         UUID;
    actorRole:       ProjectRole;
    rejectionReason: string;
  },
): Promise<Ticket> {
  if (!params.rejectionReason.trim()) {
    throw new ValidationError('rejectionReason is required when rejecting a ticket');
  }

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
        throw new ForbiddenError('Cannot reject your own ticket');
      }
    },
    to:             'REJECTED',
    patch:          { rejectionReason: params.rejectionReason, rejectedAt: new Date() },
    eventType:      'ticket.rejected',
    eventPayload:   { rejectionReason: params.rejectionReason },
  });
}
