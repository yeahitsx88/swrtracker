/**
 * AssignTicket — APPROVED → ASSIGNED (Variant 1) or CREATED → ASSIGNED (Variant 2).
 * Survey Manager assigns project-wide; Superintendent may assign within AOR.
 * Slim Build assigns an Instrument Man directly.
 */
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { assertActorHasRole, performTransition } from './shared';

export async function assignTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:                UUID;
    ticketId:                UUID;
    actorId:                 UUID;
    actorRole:               ProjectRole;
    assignedPartyChiefId:    UUID | null;
    assignedInstrumentManId: UUID | null;
  },
): Promise<Ticket> {
  assertActorHasRole(params.actorRole, ['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT']);
  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);
  const crewBuild = await repo.findActiveProjectCrewBuild(db, params.tenantId, ticket.projectId);
  if (!crewBuild) throw new ConflictError('Ticket project is not active');
  if (params.actorRole === 'SURVEY_SUPERINTENDENT' &&
      (!ticket.aorNodeId || !(await repo.isAorNodeInSurveyRoleScope(db,
        params.tenantId, ticket.projectId, params.actorId, ticket.aorNodeId,
        'SURVEY_SUPERINTENDENT')))) {
    throw new ForbiddenError('Ticket is outside Superintendent AOR scope');
  }
  if (crewBuild === 'SLIM') {
    if (params.assignedPartyChiefId || !params.assignedInstrumentManId) {
      throw new ValidationError('Slim Build requires an Instrument Man and no Party Chief');
    }
  } else {
    if (!params.assignedPartyChiefId) {
      throw new ValidationError('Full and Medium Builds require a Party Chief');
    }
    if (!(await repo.isProjectAssignee(db, params.tenantId, ticket.projectId,
      params.assignedPartyChiefId, 'PARTY_CHIEF'))) {
      throw new ForbiddenError('Party Chief is not assigned to this project');
    }
    if (params.actorRole === 'SURVEY_SUPERINTENDENT' && ticket.aorNodeId &&
        !(await repo.isAorNodeInSurveyRoleScope(db, params.tenantId,
          ticket.projectId, params.assignedPartyChiefId, ticket.aorNodeId,
          'PARTY_CHIEF'))) {
      throw new ForbiddenError('Party Chief is outside the ticket AOR');
    }
  }
  if (params.assignedInstrumentManId && !(await repo.isProjectAssignee(
    db, params.tenantId, ticket.projectId, params.assignedInstrumentManId,
    'INSTRUMENT_MAN',
  ))) {
    throw new ForbiddenError('Instrument Man is not assigned to this project');
  }
  const superintendentId = params.actorRole === 'SURVEY_SUPERINTENDENT'
    ? params.actorId
    : crewBuild === 'FULL' && ticket.aorNodeId
      ? await repo.findResponsibleSuperintendent(db, params.tenantId,
        ticket.projectId, ticket.aorNodeId)
      : null;

  return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT'],
    to:             'ASSIGNED',
    patch:          {
      assignedAt:              new Date(),
      assignedPartyChiefId:    params.assignedPartyChiefId,
      assignedInstrumentManId: params.assignedInstrumentManId,
      surveyLeadId:            params.actorId,
      surveyManagerId:         params.actorRole === 'SURVEY_MANAGER'
        ? params.actorId : ticket.surveyManagerId,
      surveySuperintendentId: superintendentId,
    },
    eventType:    'ticket.assigned',
    eventPayload: {
      assignedPartyChiefId:    params.assignedPartyChiefId,
      assignedInstrumentManId: params.assignedInstrumentManId,
    },
  });
}
