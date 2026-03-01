/**
 * OverrideRejection — REJECTED → APPROVED (CLAUDE.md §6 Permitted Non-Standard Transition).
 * Available to APPROVER role only.
 * Covers the case where a requester contacts an Approver directly after rejection.
 * A written reason is required. Logged as ticket.rejection_overridden.
 */
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { performTransition } from './shared';

export async function overrideRejection(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
    reason:    string;
  },
): Promise<Ticket> {
  if (!params.reason.trim()) {
    throw new ValidationError('A written reason is required to override a rejection');
  }

  return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['APPROVER'],
    to:             'APPROVED',
    patch:          { approvedAt: new Date(), rejectionReason: null },
    eventType:      'ticket.rejection_overridden',
    eventPayload:   { reason: params.reason },
  });
}
