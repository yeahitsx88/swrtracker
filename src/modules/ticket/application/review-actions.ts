import type { DbClient } from '@/shared/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';

/** Read-time hints only; transition commands recheck authorization and state. */
export async function getReviewActions(repo: ITicketRepository, db: DbClient,
  ticket: Ticket, actor: VisibilityScope): Promise<{ canReview: boolean; canOverride: boolean }> {
  if (actor.actorRole !== 'SURVEY_MANAGER' || !['SUBMITTED', 'REJECTED'].includes(ticket.status) ||
      ticket.workflowVariant !== 'STANDARD_APPROVAL' || ticket.draftDeletedAt ||
      [ticket.requesterId, ticket.surveyLeadId, ticket.surveyManagerId].includes(actor.actorId) ||
      (actor.companyType === 'SUBCONTRACTOR' && actor.companyId !== ticket.companyId)) {
    return { canReview: false, canOverride: false };
  }
  const active = Boolean(await repo.findActiveProjectCrewBuild(db, ticket.tenantId, ticket.projectId));
  return { canReview: active && ticket.status === 'SUBMITTED', canOverride: active && ticket.status === 'REJECTED' };
}
