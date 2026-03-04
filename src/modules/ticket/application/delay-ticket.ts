import { ValidationError } from '@/shared/errors';
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

  return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['PARTY_CHIEF', 'INSTRUMENT_MAN', 'SURVEY_SUPERINTENDENT', 'SURVEY_MANAGER'],
    to:             'PENDING_PC_APPROVAL',
    patch:          {
      pendingPcOutcome: 'DELAYED',
      pendingPcReason: params.reason,
    },
    eventType:    'ticket.pending_pc_approval',
    eventPayload: { requestedStatus: 'DELAYED', reason: params.reason },
    visibility:   params.visibility,
  });
}
