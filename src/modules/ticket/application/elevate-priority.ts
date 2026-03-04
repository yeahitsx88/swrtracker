/**
 * ElevatePriority — Path B manual priority elevation (CLAUDE.md §4).
 * Sets priority = HIGH on a post-submission ticket.
 * Permitted actor: SURVEY_MANAGER.
 * Requires a written reason. Logged as ticket.priority_elevated.
 * Requester is NOT notified — this is an internal operational action.
 */
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';

export async function elevateToPrority(
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
  if (params.actorRole !== 'SURVEY_MANAGER') {
    throw new ForbiddenError('Only SURVEY_MANAGER may elevate ticket priority');
  }
  if (!params.reason.trim()) {
    throw new ValidationError('A written reason is required to elevate priority');
  }

  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);

  await repo.patchTicket(db, params.tenantId, params.ticketId, {
    status:            ticket.status, // status unchanged
    priority:          'HIGH',
    prioritySetBy:     params.actorId,
    prioritySetReason: params.reason,
  });

  await appendAuditEvent(db, {
    ticketId:  params.ticketId,
    tenantId:  params.tenantId,
    actorId:   params.actorId,
    eventType: 'ticket.priority_elevated',
    payload:   { reason: params.reason },
  });

  return {
    ...ticket,
    priority:          'HIGH',
    prioritySetBy:     params.actorId,
    prioritySetReason: params.reason,
    updatedAt:         new Date(),
  };
}
