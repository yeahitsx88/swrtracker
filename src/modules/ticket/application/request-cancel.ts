/**
 * RequestCancel — ASSIGNED | IN_PROGRESS → CANCEL_REQUESTED.
 * Any project member may initiate a cancellation request.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { performTransition } from './shared';

const ALL_PROJECT_ROLES: readonly ProjectRole[] = [
  'REQUESTER', 'APPROVER', 'SURVEY_LEAD',
  'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD', 'VIEWER',
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
    permittedRoles: ALL_PROJECT_ROLES,
    to:             'CANCEL_REQUESTED',
    patch:          {},
    eventType:      'ticket.cancel_requested',
  });
}
