import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { CadSummary } from './cad-summary';
import type { ITicketRepository, VisibilityScope } from './ports';

export interface CadReviewRecord extends CadSummary { id: UUID }
export interface CadReviewPort {
  lock(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<CadReviewRecord[]>;
  complete(db: DbClient, tenantId: UUID, recordId: UUID, actorId: UUID, completedAt: Date): Promise<boolean>;
}

/** Caller supplies the transaction for the CAD update and both audit records. */
export async function signOffCad(tickets: ITicketRepository, cad: CadReviewPort,
  db: DbClient, params: { tenantId: UUID; ticketId: UUID; actor: VisibilityScope }) {
  if (params.actor.actorRole !== 'CAD_LEAD') throw new ForbiddenError('CAD Lead required for QA sign-off');
  if (!await tickets.findById(db, params.tenantId, params.ticketId, params.actor)) {
    throw new NotFoundError('Ticket not found');
  }
  const ticket = await tickets.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!await tickets.findActiveProjectCrewBuild(db, params.tenantId, ticket.projectId)) {
    throw new ConflictError('Ticket project is not active');
  }
  const records = await cad.lock(db, params.tenantId, params.ticketId);
  if (!records.length) throw new NotFoundError('CAD record not found');
  if (records.length !== 1) throw new ConflictError('Multiple CAD records found for this request');
  const record = records[0]!;
  if (record.status !== 'QA_PENDING') throw new ConflictError('CAD work is not awaiting QA sign-off');
  const completedAt = new Date();
  if (!await cad.complete(db, params.tenantId, record.id, params.actor.actorId, completedAt)) {
    throw new ConflictError('CAD status changed before sign-off');
  }
  for (const eventType of ['cad.status_changed', 'cad.qa_signed_off'] as const) {
    await appendAuditEvent(db, { tenantId: params.tenantId, ticketId: params.ticketId,
      actorId: params.actor.actorId, eventType, payload: {
        oldStatus: record.status, newStatus: 'COMPLETE', reviewedBy: params.actor.actorId,
        completedAt: completedAt.toISOString(),
      } });
  }
  return { status: 'COMPLETE' as const, completedAt };
}
