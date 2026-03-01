/**
 * AssignTicket — APPROVED → ASSIGNED (Variant 1) or CREATED → ASSIGNED (Variant 2).
 * Permitted actor: SURVEY_LEAD.
 */
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { performTransition } from './shared';

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
  },
): Promise<Ticket> {
  if (!params.assignedPartyChiefId) throw new ValidationError('assignedPartyChiefId is required');

  return performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['SURVEY_LEAD'],
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
  });
}
