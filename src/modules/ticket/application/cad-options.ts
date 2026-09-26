import { ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { getCadSummary, type AssignedCadSummary, type CadSummaryPort } from './cad-summary';
import { listCadAssignees, type CadAssigneesPort } from '@/modules/tenancy/application/cad-assignees';

/** Read-time hint for an already authorized ticket; activation revalidates before mutation. */
export async function canActivateCad(tickets: ITicketRepository, db: DbClient,
  ticket: Ticket, cad: AssignedCadSummary | null, actor: VisibilityScope) {
  if (actor.actorRole !== 'CAD_LEAD' || cad?.status !== 'NOT_REQUIRED' || cad.assignedTo !== null ||
      ticket.status === 'DRAFT' || ticket.status === 'REJECTED' || ticket.status.endsWith('_CANCELED') ||
      (actor.companyType === 'SUBCONTRACTOR' && actor.companyId !== ticket.companyId)) return false;
  return Boolean(await tickets.findActiveProjectCrewBuild(db, ticket.tenantId, ticket.projectId));
}

export async function getCadOptions(tickets: ITicketRepository, cad: CadSummaryPort,
  candidates: CadAssigneesPort, db: DbClient,
  params: { tenantId: UUID; ticketId: UUID; actor: VisibilityScope; search: string; limit: number; offset: number }) {
  const ticket = await tickets.findById(db, params.tenantId, params.ticketId, params.actor);
  if (!ticket) throw new NotFoundError('Ticket not found');
  const summary = await getCadSummary(tickets, cad, db, params);
  if (!await canActivateCad(tickets, db, ticket, summary, params.actor)) throw new ForbiddenError('CAD activation is not available');
  return listCadAssignees(candidates, db, { tenantId: params.tenantId, projectId: ticket.projectId,
    ticketCompanyId: ticket.companyId, search: params.search, limit: params.limit, offset: params.offset });
}
