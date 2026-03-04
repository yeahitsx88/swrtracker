/**
 * CompleteTicket — IN_PROGRESS → PENDING_PC_APPROVAL.
 * Field status submission is not final until Party Chief approval.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';

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
  return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['PARTY_CHIEF', 'INSTRUMENT_MAN', 'SURVEY_SUPERINTENDENT', 'SURVEY_MANAGER'],
    to:             'PENDING_PC_APPROVAL',
    patch:          {
      pendingPcOutcome: 'COMPLETED',
      pendingPcReason: null,
    },
    eventType:    'ticket.pending_pc_approval',
    eventPayload: { requestedStatus: 'COMPLETED' },
    visibility:   params.visibility,
  });
}
