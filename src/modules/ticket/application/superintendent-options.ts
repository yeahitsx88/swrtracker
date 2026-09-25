import { ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { listAssignmentCandidates, type AssignmentCandidatesPort } from '@/modules/tenancy/application/assignment-candidates';
import type { ITicketRepository, VisibilityScope } from './ports';
import type { Ticket } from '../domain/types';

/** Called only after ticket visibility has been established. */
export async function canReassignSuperintendent(repo: ITicketRepository, db: DbClient,
  ticket: Ticket, actor: VisibilityScope): Promise<boolean> {
  if (actor.actorRole !== 'SURVEY_MANAGER' || !ticket.aorNodeId ||
      (actor.companyType === 'SUBCONTRACTOR' && actor.companyId !== ticket.companyId) ||
      !['ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED'].includes(ticket.status)) return false;
  return await repo.findActiveProjectCrewBuild(db, ticket.tenantId, ticket.projectId) === 'FULL';
}

export async function getSuperintendentOptions(tickets: ITicketRepository,
  candidates: AssignmentCandidatesPort, db: DbClient,
  params: { tenantId: UUID; ticketId: UUID; actor: VisibilityScope;
    search: string; limit: number; offset: number }) {
  const ticket = await tickets.findById(db, params.tenantId, params.ticketId, params.actor);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!await canReassignSuperintendent(tickets, db, ticket, params.actor)) {
    throw new ForbiddenError('Superintendent reassignment is not available');
  }
  return listAssignmentCandidates(candidates, db, {
    tenantId: params.tenantId, projectId: ticket.projectId, role: 'SURVEY_SUPERINTENDENT',
    aorNodeId: ticket.aorNodeId, search: params.search, limit: params.limit, offset: params.offset,
  });
}
