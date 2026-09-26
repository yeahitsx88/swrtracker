import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { CadProgressRecord } from './progress-cad';
import type { ITicketRepository, VisibilityScope } from './ports';

export interface CadActivationPort {
  lock(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<CadProgressRecord[]>;
  activate(db: DbClient, tenantId: UUID, recordId: UUID, assigneeId: UUID): Promise<boolean>;
}

/** Caller supplies the transaction for initial assignment, activation and audit. */
export async function activateCad(tickets: ITicketRepository, cad: CadActivationPort,
  db: DbClient, params: { tenantId: UUID; ticketId: UUID; actor: VisibilityScope; assigneeId: UUID }) {
  if (params.actor.actorRole !== 'CAD_LEAD') throw new ForbiddenError('CAD Lead required to activate CAD work');
  if (!await tickets.findById(db, params.tenantId, params.ticketId, params.actor)) throw new NotFoundError('Ticket not found');
  const ticket = await tickets.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!await tickets.findActiveProjectCrewBuild(db, params.tenantId, ticket.projectId)) throw new ConflictError('Ticket project is not active');
  if (ticket.status === 'DRAFT' || ticket.status === 'REJECTED' || ticket.status.endsWith('_CANCELED')) {
    throw new ConflictError('CAD work cannot be activated for this ticket status');
  }
  const records = await cad.lock(db, params.tenantId, params.ticketId);
  if (!records.length) throw new NotFoundError('CAD record not found');
  if (records.length !== 1) throw new ConflictError('Multiple CAD records found for this request');
  const record = records[0]!;
  if (record.status !== 'NOT_REQUIRED' || record.assignedTo !== null) throw new ConflictError('CAD work is already activated or assigned');
  const eligible = await tickets.isProjectAssignee(db, params.tenantId, ticket.projectId, params.assigneeId, 'CAD_TECHNICIAN') ||
    await tickets.isProjectAssignee(db, params.tenantId, ticket.projectId, params.assigneeId, 'CAD_LEAD');
  const company = await tickets.findUserCompanyInfo(db, params.tenantId, params.assigneeId);
  if (!eligible || !company || (company.companyType === 'SUBCONTRACTOR' && company.companyId !== ticket.companyId)) {
    throw new ForbiddenError('Assignee must be an active project CAD user with access to this request');
  }
  if (!await cad.activate(db, params.tenantId, record.id, params.assigneeId)) throw new ConflictError('CAD status or assignment changed before activation');
  await appendAuditEvent(db, { tenantId: params.tenantId, ticketId: params.ticketId, actorId: params.actor.actorId,
    eventType: 'cad.status_changed', payload: { oldStatus: record.status, newStatus: 'NOT_STARTED', assignedTo: params.assigneeId } });
  return { status: 'NOT_STARTED' as const, assignedTo: params.assigneeId, completedAt: null };
}
