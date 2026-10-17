import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';

export async function reportFieldInability(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    ticketId: UUID;
    actorId: UUID;
    actorRole: ProjectRole;
    reason: string;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  const reason = params.reason.trim();
  if (!reason) throw new ValidationError('reason is required');
  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);
  if (params.actorRole !== 'INSTRUMENT_MAN' || ticket.assignedInstrumentManId !== params.actorId) {
    throw new ForbiddenError('Only the assigned Instrument Man may report inability');
  }
  const reviewerId = ticket.assignedPartyChiefId ?? ticket.surveyLeadId;
  if (!reviewerId) throw new ValidationError('A Party Chief or Survey Lead reviewer is required');

  return performTransition(db, repo, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    permittedRoles: ['INSTRUMENT_MAN'],
    to: 'PENDING_FIELD_VALIDATION',
    patch: { pendingPcReason: reason, fieldValidationReviewerId: reviewerId },
    eventType: 'ticket.field_inability_reported',
    eventPayload: { reason, reviewerId },
    visibility: params.visibility,
  });
}

export async function rejectFieldInability(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    ticketId: UUID;
    actorId: UUID;
    actorRole: ProjectRole;
    reason: string;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  const reason = params.reason.trim();
  if (!reason) throw new ValidationError('reason is required');
  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);
  if (ticket.fieldValidationReviewerId !== params.actorId ||
      !['PARTY_CHIEF', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT'].includes(params.actorRole)) {
    throw new ForbiddenError('Only the captured field-inability reviewer may reject this report');
  }

  return performTransition(db, repo, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    permittedRoles: ['PARTY_CHIEF', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT'],
    to: 'IN_PROGRESS',
    patch: { pendingPcReason: null, fieldValidationReviewerId: null },
    eventType: 'ticket.field_inability_rejected',
    eventPayload: { reason },
    visibility: params.visibility,
  });
}
