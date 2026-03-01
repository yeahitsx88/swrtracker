/**
 * RejectCancel — CANCEL_REQUESTED → CANCEL_REJECTED.
 * Requires Approver or Survey Lead sign-off (CLAUDE.md §6).
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { performTransition } from './shared';

export async function rejectCancel(
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
    permittedRoles: ['APPROVER', 'SURVEY_LEAD'],
    to:             'CANCEL_REJECTED',
    patch:          {},
    eventType:      'ticket.cancel_rejected',
  });
}
