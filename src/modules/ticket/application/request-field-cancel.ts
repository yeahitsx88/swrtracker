import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';

export async function requestFieldCancel(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
    reason?:   string;
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
      pendingPcOutcome: 'FIELD_CANCELED',
      pendingPcReason: params.reason ?? null,
    },
    eventType:    'ticket.field_cancel_requested',
    eventPayload: { reason: params.reason ?? null },
    visibility:   params.visibility,
  });
}
