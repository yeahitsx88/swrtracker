import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';

export async function delayTicket(
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
    throw new ValidationError('reason is required when submitting a delayed field status');
  }

  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);
  if (params.actorRole !== 'INSTRUMENT_MAN' || ticket.assignedInstrumentManId !== params.actorId) {
    throw new ForbiddenError('Only the assigned Instrument Man may delay this SWR');
  }

  return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['INSTRUMENT_MAN'],
    to:             'DELAYED',
    patch:          {
      pendingPcOutcome: null,
      pendingPcReason: params.reason,
    },
    eventType:    'ticket.delayed',
    eventPayload: { reason: params.reason },
    visibility:   params.visibility,
  });
}
