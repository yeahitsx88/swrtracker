/**
 * Instrument Man submits completed work for approval. The assigned Party Chief
 * finalizes it in Full/Medium Build; Survey Manager does so in Slim Build.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { performTransition } from './shared';
import { resolveFieldStatus, submitFieldStatus } from './field-status';

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
  if (params.actorRole === 'INSTRUMENT_MAN') {
    return submitFieldStatus(repo, db, { ...params, requestedStatus: 'COMPLETED' });
  }
  const current = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!current) throw new NotFoundError('Ticket not found');
  if (current.status === 'PENDING_PC_APPROVAL') {
    if (current.pendingFieldStatus !== 'COMPLETED') {
      throw new ConflictError('Pending field status is not completion');
    }
    return resolveFieldStatus(repo, db, { ...params, approve: true });
  }
  return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['PARTY_CHIEF', 'SURVEY_MANAGER'],
    authorizeTicket: (ticket) => {
      if (params.actorRole === 'PARTY_CHIEF' && ticket.assignedPartyChiefId !== params.actorId) {
        throw new ForbiddenError('You are not assigned to this ticket');
      }
      if (ticket.status === 'IN_PROGRESS' &&
          ticket.assignedInstrumentManId !== null) {
        throw new ConflictError('Instrument Man completion requires field lead approval');
      }
    },
    to:             'COMPLETED',
    patch:          { completedAt: new Date(), cancelInitiatedAt: null, cancelInitiatorRole: null },
    eventType:      'ticket.completed',
    eventPayload:   { finalStatus: 'COMPLETED', direct: true },
  });
}
