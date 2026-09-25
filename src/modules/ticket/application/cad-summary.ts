import { ConflictError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ITicketRepository, VisibilityScope } from './ports';

export interface CadSummary {
  status: 'NOT_REQUIRED' | 'NOT_STARTED' | 'IN_PROGRESS' | 'QA_PENDING' | 'COMPLETE';
  completedAt: Date | null;
}
export interface CadSummaryPort {
  find(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<CadSummary[]>;
}

export async function getCadSummary(tickets: ITicketRepository, cad: CadSummaryPort,
  db: DbClient, params: { tenantId: UUID; ticketId: UUID; actor: VisibilityScope }) {
  const ticket = await tickets.findById(db, params.tenantId, params.ticketId, params.actor);
  if (!ticket) throw new NotFoundError('Ticket not found');
  const rows = await cad.find(db, params.tenantId, params.ticketId);
  if (rows.length > 1) throw new ConflictError('Multiple CAD records found for this request');
  return rows[0] ?? null;
}
