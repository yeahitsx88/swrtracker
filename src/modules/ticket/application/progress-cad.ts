import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { CadReviewRecord } from './sign-off-cad';
import type { ITicketRepository, VisibilityScope } from './ports';

export interface CadProgressRecord extends CadReviewRecord { assignedTo: UUID | null }
export interface CadProgressPort {
  lock(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<CadProgressRecord[]>;
  advance(db: DbClient, tenantId: UUID, recordId: UUID, actorId: UUID,
    from: 'NOT_STARTED' | 'IN_PROGRESS', to: 'IN_PROGRESS' | 'QA_PENDING'): Promise<boolean>;
}

/** Caller supplies the transaction; progression never completes QA or changes field status. */
export async function progressCad(tickets: ITicketRepository, cad: CadProgressPort,
  db: DbClient, params: { tenantId: UUID; ticketId: UUID; actor: VisibilityScope;
    action: 'START' | 'SUBMIT_QA' }) {
  if (!['CAD_TECHNICIAN', 'CAD_LEAD'].includes(params.actor.actorRole)) {
    throw new ForbiddenError('Assigned CAD user required');
  }
  if (!await tickets.findById(db, params.tenantId, params.ticketId, params.actor)) {
    throw new NotFoundError('Ticket not found');
  }
  const ticket = await tickets.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!await tickets.findActiveProjectCrewBuild(db, params.tenantId, ticket.projectId)) {
    throw new ConflictError('Ticket project is not active');
  }
  const rows = await cad.lock(db, params.tenantId, params.ticketId);
  if (!rows.length) throw new NotFoundError('CAD record not found');
  if (rows.length !== 1) throw new ConflictError('Multiple CAD records found for this request');
  const record = rows[0]!;
  if (record.assignedTo !== params.actor.actorId) throw new ForbiddenError('CAD work is assigned to another user');
  const from = params.action === 'START' ? 'NOT_STARTED' : 'IN_PROGRESS';
  const to = params.action === 'START' ? 'IN_PROGRESS' : 'QA_PENDING';
  if (record.status !== from) throw new ConflictError(`CAD work must be ${from} for this action`);
  if (!await cad.advance(db, params.tenantId, record.id, params.actor.actorId, from, to)) {
    throw new ConflictError('CAD assignment or status changed before update');
  }
  await appendAuditEvent(db, { tenantId: params.tenantId, ticketId: params.ticketId,
    actorId: params.actor.actorId, eventType: 'cad.status_changed',
    payload: { oldStatus: from, newStatus: to, assignedTo: record.assignedTo } });
  return { status: to, completedAt: null };
}
