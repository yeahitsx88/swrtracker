import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { assertValidTransition } from '@/modules/workflow/domain/transitions';
import { listAssignmentCandidates, type AssignmentCandidatesPort } from '@/modules/tenancy/application/assignment-candidates';
import type { ITicketRepository, VisibilityScope } from './ports';

export async function getAssignmentOptions(tickets: ITicketRepository, candidates: AssignmentCandidatesPort,
  db: DbClient, params: { tenantId: UUID; ticketId: UUID; actor: VisibilityScope;
    role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN'; search: string; limit: number; offset: number }) {
  const ticket = await tickets.findById(db, params.tenantId, params.ticketId, params.actor);
  if (!ticket) throw new NotFoundError('Ticket not found');
  const role = params.actor.actorRole;
  if (role !== 'SURVEY_MANAGER' && role !== 'SURVEY_SUPERINTENDENT') {
    throw new ForbiddenError('Survey Manager or Superintendent required');
  }
  assertValidTransition(ticket.workflowVariant, ticket.status, 'ASSIGNED');
  const crewBuild = await tickets.findActiveProjectCrewBuild(db, params.tenantId, ticket.projectId);
  if (!crewBuild) throw new ConflictError('Ticket project is not active');
  if (role === 'SURVEY_SUPERINTENDENT' && (!ticket.aorNodeId ||
      !await tickets.isAorNodeInSurveyRoleScope(db, params.tenantId, ticket.projectId,
        params.actor.actorId, ticket.aorNodeId, 'SURVEY_SUPERINTENDENT'))) {
    throw new ForbiddenError('Ticket is outside Superintendent AOR scope');
  }
  const page = await listAssignmentCandidates(candidates, db, {
    tenantId: params.tenantId, projectId: ticket.projectId, role: params.role,
    aorNodeId: role === 'SURVEY_SUPERINTENDENT' && params.role === 'PARTY_CHIEF' ? ticket.aorNodeId : null,
    search: params.search, limit: params.limit, offset: params.offset,
  });
  return { crewBuild, ...page,
    ...(crewBuild === 'SLIM' && params.role === 'PARTY_CHIEF' ? { candidates: [], hasMore: false } : {}),
  };
}
