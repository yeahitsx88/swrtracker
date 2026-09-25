import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket, TicketPriority } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';

const TERMINAL_STATUSES = new Set<Ticket['status']>([
  'COMPLETED',
  'REJECTED',
  'REQUESTER_CANCELED',
  'FIELD_CANCELED',
  'SURVEY_CANCELED',
]);

export async function revisePriority(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    ticketId: UUID;
    actorId: UUID;
    actorRole: ProjectRole;
    priority: TicketPriority;
    reason: string;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  if (params.actorRole !== 'SURVEY_MANAGER') {
    throw new ForbiddenError('Only the Survey Lead may revise SWR priority');
  }
  const reason = params.reason.trim();
  if (!reason) throw new ValidationError('reason is required when revising SWR priority');
  if (!['NORMAL', 'HIGH'].includes(params.priority)) {
    throw new ValidationError('priority must be NORMAL or HIGH');
  }

  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);
  if (TERMINAL_STATUSES.has(ticket.status)) {
    throw new ConflictError('Priority cannot be revised after an SWR reaches a terminal state');
  }
  if (ticket.priority === params.priority) {
    throw new ConflictError(`SWR priority is already ${params.priority}`);
  }

  await repo.patchTicket(db, params.tenantId, params.ticketId, {
    status: ticket.status,
    priority: params.priority,
    prioritySetBy: params.actorId,
    prioritySetReason: reason,
  }, {
    expectedStatus: ticket.status,
    expectedRowVersion: ticket.rowVersion,
  });

  await appendAuditEvent(db, {
    ticketId: params.ticketId,
    tenantId: params.tenantId,
    actorId: params.actorId,
    eventType: 'ticket.priority_revised',
    payload: { oldPriority: ticket.priority, newPriority: params.priority, reason },
  });

  return {
    ...ticket,
    priority: params.priority,
    prioritySetBy: params.actorId,
    prioritySetReason: reason,
    rowVersion: (ticket.rowVersion ?? 0) + 1,
    updatedAt: new Date(),
  };
}
