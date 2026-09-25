import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { appendAuditEvent } from '@/modules/audit/application';
import { enqueueRequesterNotification } from './amelia-notifications';

export async function reviseNeedBy(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    ticketId: UUID;
    actorId: UUID;
    actorRole: ProjectRole;
    requestedDate: Date;
    reason: string;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  if (params.actorRole !== 'SURVEY_MANAGER') throw new ForbiddenError('Only the Survey Lead may revise Need-By');
  if (!params.reason.trim()) throw new ValidationError('reason is required');
  if (Number.isNaN(params.requestedDate.getTime())) throw new ValidationError('requestedDate is invalid');
  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);
  if (['COMPLETED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED'].includes(ticket.status)) {
    throw new ValidationError('Need-By cannot change on a terminal SWR');
  }
  const oldDate = ticket.requestedDate;
  if (oldDate.toISOString().slice(0, 10) === params.requestedDate.toISOString().slice(0, 10)) {
    throw new ValidationError('New Need-By date must differ from the current date');
  }

  await repo.patchTicket(db, params.tenantId, params.ticketId, {
    status: ticket.status,
    requestedDate: params.requestedDate,
  }, { expectedStatus: ticket.status, expectedRowVersion: ticket.rowVersion });
  await db.query(
    `INSERT INTO ticket_need_by_revisions
       (tenant_id, ticket_id, old_date, new_date, reason, revised_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [params.tenantId, params.ticketId, oldDate, params.requestedDate, params.reason.trim(), params.actorId],
  );
  await appendAuditEvent(db, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    actorId: params.actorId,
    eventType: 'ticket.need_by_revised',
    payload: { oldDate, newDate: params.requestedDate, reason: params.reason.trim() },
  });
  await enqueueRequesterNotification(db, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    requesterId: ticket.requesterId,
    eventType: 'NEED_BY_REVISED',
    payload: { oldDate, newDate: params.requestedDate, reason: params.reason.trim() },
    idempotencyKey: `${params.ticketId}:need-by:${ticket.rowVersion ?? 0}`,
  });
  return {
    ...ticket,
    requestedDate: params.requestedDate,
    rowVersion: (ticket.rowVersion ?? 0) + 1,
    updatedAt: new Date(),
  };
}
