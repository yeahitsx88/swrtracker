import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { listAssignmentCandidates, type AssignmentCandidatesPort } from '@/modules/tenancy/application/assignment-candidates';
import type { ITicketRepository, VisibilityScope } from './ports';
import type { Ticket } from '../domain/types';

async function authorizeReassignment(repo: ITicketRepository, db: DbClient,
  ticket: Ticket, actor: VisibilityScope) {
  if (!['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT', 'PARTY_CHIEF'].includes(actor.actorRole) ||
      (actor.companyType === 'SUBCONTRACTOR' && actor.companyId !== ticket.companyId)) {
    throw new ForbiddenError('Survey crew authority required for reassignment');
  }
  if (!['ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED'].includes(ticket.status)) {
    throw new ConflictError('Ticket is not in a reassignable state');
  }
  const crewBuild = await repo.findActiveProjectCrewBuild(db, ticket.tenantId, ticket.projectId);
  if (!crewBuild) throw new ConflictError('Ticket project is not active');
  if (actor.actorRole === 'SURVEY_SUPERINTENDENT' && (!ticket.aorNodeId ||
      !await repo.isAorNodeInSurveyRoleScope(db, ticket.tenantId, ticket.projectId,
        actor.actorId, ticket.aorNodeId, 'SURVEY_SUPERINTENDENT'))) {
    throw new ForbiddenError('Ticket is outside Superintendent AOR scope');
  }
  if (actor.actorRole === 'PARTY_CHIEF' &&
      (ticket.assignedPartyChiefId !== actor.actorId || crewBuild === 'SLIM')) {
    throw new ForbiddenError('Party Chief may reassign only their own ticket');
  }
  return { crewBuild, canChangePartyChief: crewBuild !== 'SLIM' && actor.actorRole !== 'PARTY_CHIEF',
    instrumentManRequired: crewBuild === 'SLIM' || actor.actorRole === 'PARTY_CHIEF' };
}

/** Called only after ticket visibility has been established. */
export async function getReassignmentCapability(repo: ITicketRepository, db: DbClient,
  ticket: Ticket, actor: VisibilityScope) {
  try { return await authorizeReassignment(repo, db, ticket, actor); }
  catch (error) {
    if (error instanceof ForbiddenError || error instanceof ConflictError) return null;
    throw error;
  }
}

export async function getReassignmentOptions(tickets: ITicketRepository,
  candidates: AssignmentCandidatesPort, db: DbClient,
  params: { tenantId: UUID; ticketId: UUID; actor: VisibilityScope;
    role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN'; search: string; limit: number; offset: number }) {
  const ticket = await tickets.findById(db, params.tenantId, params.ticketId, params.actor);
  if (!ticket) throw new NotFoundError('Ticket not found');
  const capability = await authorizeReassignment(tickets, db, ticket, params.actor);
  if (params.role === 'PARTY_CHIEF' && !capability.canChangePartyChief) {
    throw new ForbiddenError('Party Chief replacement is not available');
  }
  const page = await listAssignmentCandidates(candidates, db, {
    tenantId: params.tenantId, projectId: ticket.projectId, role: params.role,
    aorNodeId: params.actor.actorRole === 'SURVEY_SUPERINTENDENT' && params.role === 'PARTY_CHIEF'
      ? ticket.aorNodeId : null,
    search: params.search, limit: params.limit, offset: params.offset,
  });
  return { ...capability, ...page };
}
