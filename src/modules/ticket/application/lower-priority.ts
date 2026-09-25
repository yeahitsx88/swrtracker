import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';

const rank = { NORMAL: 0, MEDIUM: 1, MED_HIGH: 2, HIGH: 3 } as const;

export async function lowerPriority(repo: ITicketRepository, db: DbClient, params: {
  tenantId: UUID; ticketId: UUID; actorId: UUID; actorRole: ProjectRole;
  priority: Ticket['priority']; reason: string; highDowngradeConfirmed: boolean;
}): Promise<Ticket> {
  if (params.actorRole !== 'SURVEY_MANAGER') {
    throw new ForbiddenError('Only Survey Manager may lower priority');
  }
  if (!Object.hasOwn(rank, params.priority)) throw new ValidationError('Invalid priority');
  const reason = params.reason.trim();
  if (!reason) throw new ValidationError('Reason is required');
  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (['DRAFT', 'REJECTED', 'COMPLETED', 'REQUESTER_CANCELED',
    'FIELD_CANCELED', 'SURVEY_CANCELED'].includes(ticket.status)) {
    throw new ConflictError('Priority cannot change at this ticket status');
  }
  if (rank[params.priority] >= rank[ticket.priority]) {
    throw new ValidationError('New priority must be lower than current priority');
  }
  if (ticket.priority === 'HIGH' && !params.highDowngradeConfirmed) {
    throw new ValidationError('HIGH priority downgrade requires confirmation');
  }
  await repo.patchTicket(db, params.tenantId, ticket.id, {
    status: ticket.status, priority: params.priority,
    prioritySetBy: params.actorId,
    prioritySetReason: reason,
  });
  await appendAuditEvent(db, { ticketId: ticket.id, tenantId: params.tenantId,
    actorId: params.actorId,
    eventType: ticket.priority === 'HIGH'
      ? 'ticket.priority_downgrade_confirmed' : 'ticket.priority_lowered',
    payload: { oldPriority: ticket.priority, newPriority: params.priority,
      reason, highDowngradeConfirmed: ticket.priority === 'HIGH' },
  });
  return { ...ticket, priority: params.priority,
    prioritySetBy: params.actorId, prioritySetReason: reason, updatedAt: new Date() };
}
