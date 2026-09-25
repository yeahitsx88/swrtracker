import type { DbClient } from '@/shared/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';

/** Read hints after ticket visibility; cancellation commands remain authoritative. */
export async function getSurveyCancelActions(repo: ITicketRepository, db: DbClient, ticket: Ticket, actor: VisibilityScope) {
  const none = { canInitiate: false, canApprove: false, immediate: false, pending: false };
  if (['DRAFT', 'COMPLETED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED'].includes(ticket.status) ||
      ticket.draftDeletedAt) return none;
  const pending = Boolean(ticket.cancelInitiatedAt);
  const manager = actor.actorRole === 'SURVEY_MANAGER';
  const chief = actor.actorRole === 'PARTY_CHIEF' && ticket.assignedPartyChiefId === actor.actorId;
  const superintendent = actor.actorRole === 'SURVEY_SUPERINTENDENT' && ticket.surveySuperintendentId === actor.actorId;
  if ((!manager && !chief && !superintendent) ||
      (actor.companyType === 'SUBCONTRACTOR' && actor.companyId !== ticket.companyId) ||
      !await repo.findActiveProjectCrewBuild(db, ticket.tenantId, ticket.projectId)) return { ...none, pending };
  return { pending, canInitiate: !pending, immediate: manager,
    canApprove: pending && Boolean(ticket.cancelReason && ticket.cancelInitiatedBy) &&
      ticket.cancelInitiatedBy !== actor.actorId && (manager || superintendent && ticket.cancelInitiatorRole === 'PARTY_CHIEF') };
}
