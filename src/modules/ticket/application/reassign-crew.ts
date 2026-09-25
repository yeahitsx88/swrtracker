import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import type { HelpFlagRepositoryPort } from './help-flags';
import { clearResolvedFlagsForTicket } from './help-flags';

const REASSIGNABLE = new Set<Ticket['status']>([
  'ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED',
]);

export async function reassignCrew(
  repo: ITicketRepository, helpFlags: HelpFlagRepositoryPort, db: DbClient,
  params: { tenantId: UUID; ticketId: UUID; actorId: UUID;
    actorRole: ProjectRole; assignedPartyChiefId: UUID | null;
    assignedInstrumentManId: UUID | null; reason: string },
): Promise<Ticket> {
  if (!['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT', 'PARTY_CHIEF'].includes(
    params.actorRole)) {
    throw new ForbiddenError('Survey crew authority required for reassignment');
  }
  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!REASSIGNABLE.has(ticket.status)) {
    throw new ConflictError('Ticket is not in a reassignable state');
  }
  const reason = params.reason.trim();
  if (!reason || reason.length > 500) {
    throw new ValidationError('Reassignment reason must be 1-500 characters');
  }
  if (ticket.assignedPartyChiefId === params.assignedPartyChiefId &&
      ticket.assignedInstrumentManId === params.assignedInstrumentManId) {
    throw new ConflictError('Crew assignment is unchanged');
  }
  const build = await repo.findActiveProjectCrewBuild(db,
    params.tenantId, ticket.projectId);
  if (!build) throw new ConflictError('Ticket project is not active');
  if (params.actorRole === 'SURVEY_SUPERINTENDENT' &&
      (!ticket.aorNodeId || !(await repo.isAorNodeInSurveyRoleScope(db,
        params.tenantId, ticket.projectId, params.actorId, ticket.aorNodeId,
        'SURVEY_SUPERINTENDENT')))) {
    throw new ForbiddenError('Ticket is outside Superintendent AOR scope');
  }
  const instrumentManOnly =
    ticket.assignedPartyChiefId === params.assignedPartyChiefId;
  if (params.actorRole === 'PARTY_CHIEF' &&
      (ticket.assignedPartyChiefId !== params.actorId || !instrumentManOnly ||
        !params.assignedInstrumentManId)) {
    throw new ForbiddenError('Party Chief may reassign an Instrument Man only on their own ticket');
  }
  if (build === 'SLIM') {
    if (params.assignedPartyChiefId || !params.assignedInstrumentManId) {
      throw new ValidationError('Slim Build requires an Instrument Man without a Party Chief');
    }
  } else {
    if (!params.assignedPartyChiefId) {
      throw new ValidationError('Full and Medium Builds require a Party Chief');
    }
    if (!(await repo.isProjectAssignee(db, params.tenantId, ticket.projectId,
      params.assignedPartyChiefId, 'PARTY_CHIEF'))) {
      throw new ForbiddenError('Party Chief is not an active project assignee');
    }
    if (params.actorRole === 'SURVEY_SUPERINTENDENT' && !instrumentManOnly &&
        ticket.aorNodeId &&
        !(await repo.isAorNodeInSurveyRoleScope(db, params.tenantId,
          ticket.projectId, params.assignedPartyChiefId, ticket.aorNodeId,
          'PARTY_CHIEF'))) {
      throw new ForbiddenError('Party Chief is outside the ticket AOR');
    }
  }
  if (params.assignedInstrumentManId) {
    if (!(await repo.isProjectAssignee(db, params.tenantId, ticket.projectId,
      params.assignedInstrumentManId, 'INSTRUMENT_MAN'))) {
      throw new ForbiddenError('Instrument Man is not an active project assignee');
    }
  }
  await repo.patchTicket(db, params.tenantId, ticket.id, {
    status: ticket.status,
    assignedPartyChiefId: params.assignedPartyChiefId,
    assignedInstrumentManId: params.assignedInstrumentManId,
    assignedAt: new Date(),
  });
  if (instrumentManOnly) {
    await appendAuditEvent(db, { ticketId: ticket.id,
      tenantId: params.tenantId, actorId: params.actorId,
      eventType: 'ticket.im_reassigned', payload: {
        partyChiefId: ticket.assignedPartyChiefId,
        oldInstrumentManId: ticket.assignedInstrumentManId,
        newInstrumentManId: params.assignedInstrumentManId,
        reason, status: ticket.status } });
  } else {
    await appendAuditEvent(db, { ticketId: ticket.id,
      tenantId: params.tenantId, actorId: params.actorId,
      eventType: 'ticket.unassigned', payload: {
        oldPartyChiefId: ticket.assignedPartyChiefId,
        oldInstrumentManId: ticket.assignedInstrumentManId,
        reason, status: ticket.status } });
    await appendAuditEvent(db, { ticketId: ticket.id,
      tenantId: params.tenantId, actorId: params.actorId,
      eventType: 'ticket.assigned', payload: {
        assignedPartyChiefId: params.assignedPartyChiefId,
        assignedInstrumentManId: params.assignedInstrumentManId,
        reason, previousStatus: ticket.status } });
  }
  await clearResolvedFlagsForTicket(helpFlags, db, params.tenantId,
    ticket.projectId, ticket.id, params.actorId);
  return { ...ticket,
    assignedPartyChiefId: params.assignedPartyChiefId,
    assignedInstrumentManId: params.assignedInstrumentManId,
    assignedAt: new Date(), updatedAt: new Date() };
}
