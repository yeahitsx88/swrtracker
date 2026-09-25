import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { assertValidTransition } from '@/modules/workflow/domain/transitions';
import { listAssignmentCandidates, type AssignmentCandidatesPort } from '@/modules/tenancy/application/assignment-candidates';
import type { ITicketRepository, VisibilityScope } from './ports';
import type { Ticket } from '../domain/types';

export async function getAssignmentOptions(tickets: ITicketRepository, candidates: AssignmentCandidatesPort,
  db: DbClient, params: { tenantId: UUID; ticketId: UUID; actor: VisibilityScope;
    role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN'; search: string; limit: number; offset: number }) {
  const ticket = await tickets.findById(db, params.tenantId, params.ticketId, params.actor);
  if (!ticket) throw new NotFoundError('Ticket not found');
  const crewBuild = await authorizeAssignment(tickets, db, ticket, params.actor);
  const page = await listAssignmentCandidates(candidates, db, {
    tenantId: params.tenantId, projectId: ticket.projectId, role: params.role,
    aorNodeId: params.actor.actorRole === 'SURVEY_SUPERINTENDENT' && params.role === 'PARTY_CHIEF' ? ticket.aorNodeId : null,
    search: params.search, limit: params.limit, offset: params.offset,
  });
  return { crewBuild, ...page,
    ...(crewBuild === 'SLIM' && params.role === 'PARTY_CHIEF' ? { candidates: [], hasMore: false } : {}),
  };
}

async function authorizeAssignment(tickets: ITicketRepository, db: DbClient, ticket: Ticket, actor: VisibilityScope) {
  const role = actor.actorRole;
  if (role !== 'SURVEY_MANAGER' && role !== 'SURVEY_SUPERINTENDENT') {
    throw new ForbiddenError('Survey Manager or Superintendent required');
  }
  assertValidTransition(ticket.workflowVariant, ticket.status, 'ASSIGNED');
  const crewBuild = await tickets.findActiveProjectCrewBuild(db, ticket.tenantId, ticket.projectId);
  if (!crewBuild) throw new ConflictError('Ticket project is not active');
  if (role === 'SURVEY_SUPERINTENDENT' && (!ticket.aorNodeId ||
      !await tickets.isAorNodeInSurveyRoleScope(db, ticket.tenantId, ticket.projectId,
        actor.actorId, ticket.aorNodeId, 'SURVEY_SUPERINTENDENT'))) {
    throw new ForbiddenError('Ticket is outside Superintendent AOR scope');
  }
  return crewBuild;
}

/** Called only after ticket visibility has been established. */
export async function getAssignmentCapability(tickets: ITicketRepository, db: DbClient, ticket: Ticket, actor: VisibilityScope) {
  try { return { crewBuild: await authorizeAssignment(tickets, db, ticket, actor) }; }
  catch (error) {
    if (error instanceof ForbiddenError || error instanceof ConflictError) return null;
    throw error;
  }
}
