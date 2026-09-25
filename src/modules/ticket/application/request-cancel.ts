/**
 * Requester cancellation is immediate from any active state.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { ForbiddenError } from '@/shared/errors';
import { performTransition } from './shared';

const REQUESTER_CAPABLE_ROLES: readonly ProjectRole[] = [
  'PROJECT_ADMIN', 'REQUESTER', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT',
  'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD',
  'VIEWER', 'AREA_VIEWER',
  'DEPARTMENT_MANAGER', 'DEPARTMENT_LEAD', 'SUBCONTRACTS_COORDINATOR',
];

export async function requestCancel(
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
    permittedRoles: REQUESTER_CAPABLE_ROLES,
    authorizeTicket: (ticket) => {
      if (ticket.requesterId !== params.actorId) {
        throw new ForbiddenError('Only the ticket requester may cancel it');
      }
    },
    to:             'REQUESTER_CANCELED',
    patch:          { canceledAt: new Date(), pendingFieldStatus: null,
      pendingFieldReason: null, pendingFieldInitiatedBy: null,
      cancelInitiatedBy: null, cancelInitiatedAt: null, cancelInitiatorRole: null },
    eventType:      'ticket.requester_canceled',
  });
}
