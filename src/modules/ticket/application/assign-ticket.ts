/**
 * AssignTicket — standard-approval first assignment plus direct-assignment reassignment.
 * Permitted actors: SURVEY_MANAGER, SURVEY_SUPERINTENDENT.
 */
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { appendAuditEvent } from '@/modules/audit/application/index';
import { assertActorHasRole, performTransition } from './shared';

export async function assignTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:                UUID;
    ticketId:                UUID;
    actorId:                 UUID;
    actorRole:               ProjectRole;
    assignedPartyChiefId:    UUID;
    assignedInstrumentManId: UUID | null;
    surveyLeadId:            UUID;
    visibility?:             VisibilityScope;
  },
): Promise<Ticket> {
  if (!params.assignedPartyChiefId) throw new ValidationError('assignedPartyChiefId is required');

  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);

  assertActorHasRole(params.actorRole, ['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT']);

  if (ticket.workflowVariant === 'DIRECT_ASSIGNMENT') {
    if (!['ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED'].includes(ticket.status)) {
      throw new ConflictError('Direct-assignment tickets may only be reassigned while active');
    }

    const assignedAt = ticket.assignedAt ?? new Date();
    await repo.patchTicket(db, params.tenantId, params.ticketId, {
      status: ticket.status,
      assignedAt,
      assignedPartyChiefId: params.assignedPartyChiefId,
      assignedInstrumentManId: params.assignedInstrumentManId,
      surveyLeadId: params.surveyLeadId,
    }, {
      expectedStatus: ticket.status,
      expectedRowVersion: ticket.rowVersion,
    });
    await appendAuditEvent(db, {
      ticketId: params.ticketId,
      tenantId: params.tenantId,
      actorId: params.actorId,
      eventType: 'ticket.assigned',
      payload: {
        assignedPartyChiefId: params.assignedPartyChiefId,
        assignedInstrumentManId: params.assignedInstrumentManId,
      },
    });

    return {
      ...ticket,
      assignedAt,
      assignedPartyChiefId: params.assignedPartyChiefId,
      assignedInstrumentManId: params.assignedInstrumentManId,
      surveyLeadId: params.surveyLeadId,
      rowVersion: (ticket.rowVersion ?? 0) + 1,
      updatedAt: new Date(),
    };
  }

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
      surveyLeadId:            params.surveyLeadId,
    },
    eventType:    'ticket.assigned',
    eventPayload: {
      assignedPartyChiefId:    params.assignedPartyChiefId,
      assignedInstrumentManId: params.assignedInstrumentManId,
    },
    visibility: params.visibility,
  });
}
