/**
 * SubmitTicket — Variant 1 only (DRAFT → SUBMITTED).
 * Enforces the 48-hour minimum notice rule (CLAUDE.md §4 and §6).
 * Only the ticket's own REQUESTER may submit.
 */
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { performTransition } from './shared';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export async function submitTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
  },
): Promise<Ticket> {
  if (params.actorRole !== 'REQUESTER') {
    throw new ForbiddenError('Only REQUESTER may submit a ticket');
  }

  // Fetch ticket first to enforce the 48-hour rule
  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);

  // REQUESTER can only submit their own tickets
  if (ticket.requesterId !== params.actorId) {
    throw new ForbiddenError('You can only submit your own tickets');
  }

  const now = Date.now();
  if (ticket.requestedDate.getTime() < now + FORTY_EIGHT_HOURS_MS) {
    throw new ValidationError(
      'Requested date must be at least 48 hours from now (CLAUDE.md §4 — The 48-Hour Rule)',
    );
  }

  return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['REQUESTER'],
    to:             'SUBMITTED',
    patch:          { submittedAt: new Date() },
    eventType:      'ticket.submitted',
  });
}
