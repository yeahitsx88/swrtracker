import type { DbClient } from '@/shared/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';

export async function getFieldActions(repo: ITicketRepository, db: DbClient, ticket: Ticket, actor: VisibilityScope) {
  const unavailable = { canStart: false, canReport: false, canRequestFieldCancel: false,
    canResolve: false, canRestart: false, canCompleteDirectly: false };
  const manager = actor.actorRole === 'SURVEY_MANAGER';
  const chief = actor.actorRole === 'PARTY_CHIEF' && ticket.assignedPartyChiefId === actor.actorId;
  const instrument = actor.actorRole === 'INSTRUMENT_MAN' && ticket.assignedInstrumentManId === actor.actorId;
  const superintendent = actor.actorRole === 'SURVEY_SUPERINTENDENT' && ticket.surveySuperintendentId === actor.actorId;
  if ((!manager && !chief && !instrument && !superintendent) || ticket.draftDeletedAt ||
      (actor.companyType === 'SUBCONTRACTOR' && actor.companyId !== ticket.companyId) ||
      !await repo.findActiveProjectCrewBuild(db, ticket.tenantId, ticket.projectId)) return unavailable;
  const lead = manager || chief || superintendent;
  return {
    canStart: ticket.status === 'ASSIGNED' && (manager || chief || instrument),
    canReport: ticket.status === 'IN_PROGRESS' && instrument,
    canRequestFieldCancel: ['IN_PROGRESS', 'DELAYED'].includes(ticket.status) && instrument,
    canResolve: ticket.status === 'PENDING_PC_APPROVAL' && Boolean(ticket.pendingFieldStatus) && lead,
    canRestart: ticket.status === 'DELAYED' && lead,
    canCompleteDirectly: ticket.status === 'IN_PROGRESS' && !ticket.assignedInstrumentManId && (manager || chief),
  };
}
