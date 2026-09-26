import { ConflictError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import type { Ticket } from '../domain/types';

export interface CadSummary {
  status: 'NOT_REQUIRED' | 'NOT_STARTED' | 'IN_PROGRESS' | 'QA_PENDING' | 'COMPLETE';
  completedAt: Date | null;
}
export interface AssignedCadSummary extends CadSummary { assignedTo: UUID | null }
export interface CadSummaryPort {
  find(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<AssignedCadSummary[]>;
}

export async function getCadSummary(tickets: ITicketRepository, cad: CadSummaryPort,
  db: DbClient, params: { tenantId: UUID; ticketId: UUID; actor: VisibilityScope }) {
  const ticket = await tickets.findById(db, params.tenantId, params.ticketId, params.actor);
  if (!ticket) throw new NotFoundError('Ticket not found');
  const rows = await cad.find(db, params.tenantId, params.ticketId);
  if (rows.length > 1) throw new ConflictError('Multiple CAD records found for this request');
  return rows[0] ?? null;
}

/** Read-time hint; the mutation rechecks role, visibility, state and project. */
export async function canSignOffCad(tickets: ITicketRepository, db: DbClient,
  ticket: Ticket, cad: CadSummary | null, actor: VisibilityScope) {
  if (actor.actorRole !== 'CAD_LEAD' || cad?.status !== 'QA_PENDING' ||
      (actor.companyType === 'SUBCONTRACTOR' && actor.companyId !== ticket.companyId)) return false;
  return Boolean(await tickets.findActiveProjectCrewBuild(db, ticket.tenantId, ticket.projectId));
}

/** Read-time hint for the assigned CAD worker; commands revalidate before writing. */
export async function getCadProgressAction(tickets: ITicketRepository, db: DbClient,
  ticket: Ticket, cad: AssignedCadSummary | null, actor: VisibilityScope): Promise<'START' | 'SUBMIT_QA' | null> {
  if (!cad || !['CAD_TECHNICIAN', 'CAD_LEAD'].includes(actor.actorRole) ||
      cad.assignedTo !== actor.actorId ||
      (actor.companyType === 'SUBCONTRACTOR' && actor.companyId !== ticket.companyId) ||
      !['NOT_STARTED', 'IN_PROGRESS'].includes(cad.status)) return null;
  if (!await tickets.findActiveProjectCrewBuild(db, ticket.tenantId, ticket.projectId)) return null;
  return cad.status === 'NOT_STARTED' ? 'START' : 'SUBMIT_QA';
}
