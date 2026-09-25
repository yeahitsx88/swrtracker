import type { DbClient } from '@/shared/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';

const priorities: Ticket['priority'][] = ['NORMAL', 'MEDIUM', 'MED_HIGH', 'HIGH'];
export async function getPriorityActions(repo: ITicketRepository, db: DbClient, ticket: Ticket, actor: VisibilityScope) {
  const none = { canElevate: false, lowerChoices: [] as Ticket['priority'][] };
  if (actor.actorRole !== 'SURVEY_MANAGER' ||
      ['DRAFT', 'COMPLETED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED'].includes(ticket.status) ||
      (actor.companyType === 'SUBCONTRACTOR' && actor.companyId !== ticket.companyId) ||
      !await repo.findActiveProjectCrewBuild(db, ticket.tenantId, ticket.projectId)) return none;
  return { canElevate: ticket.priority !== 'HIGH', lowerChoices: ticket.status === 'REJECTED' ? []
    : priorities.slice(0, priorities.indexOf(ticket.priority)) };
}
