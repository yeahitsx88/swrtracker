/**
 * Amelia assignment model: Party Chief is optional; Instrument Man assignment
 * is what moves an approved SWR to ASSIGNED. Survey retains cover authority and
 * an assigned Party Chief may assign or change the Instrument Man.
 */
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { assertValidTransition } from '@/modules/workflow/domain/transitions';
import { enqueueRequesterNotification } from './amelia-notifications';

export async function assignTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    ticketId: UUID;
    actorId: UUID;
    actorRole: ProjectRole;
    assignedPartyChiefId: UUID | null;
    assignedInstrumentManId: UUID | null;
    surveyLeadId: UUID;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  if (!params.assignedPartyChiefId && !params.assignedInstrumentManId) {
    throw new ValidationError('A Party Chief or Instrument Man assignment is required');
  }

  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);
  if (!['APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED'].includes(ticket.status)) {
    throw new ConflictError('Assignments may only change on approved or active work');
  }

  const surveyActor = params.actorRole === 'SURVEY_MANAGER' || params.actorRole === 'SURVEY_SUPERINTENDENT';
  const assignedPartyChiefActor = params.actorRole === 'PARTY_CHIEF' && ticket.assignedPartyChiefId === params.actorId;
  if (!surveyActor && !assignedPartyChiefActor) {
    throw new ForbiddenError('Only Survey or the assigned Party Chief may change assignments');
  }
  if (assignedPartyChiefActor && params.assignedPartyChiefId !== ticket.assignedPartyChiefId) {
    throw new ForbiddenError('Party Chiefs cannot change the Party Chief assignment');
  }

  if (!repo.isActiveProjectMemberWithRole) {
    throw new Error('Ticket repository does not support assignment eligibility checks');
  }
  if (params.assignedPartyChiefId && !await repo.isActiveProjectMemberWithRole(
    db, params.tenantId, ticket.projectId, params.assignedPartyChiefId, ['PARTY_CHIEF'],
  )) {
    throw new ValidationError('assignedPartyChiefId must be an active Party Chief on this project');
  }
  if (params.assignedInstrumentManId && !await repo.isActiveProjectMemberWithRole(
    db, params.tenantId, ticket.projectId, params.assignedInstrumentManId, ['INSTRUMENT_MAN'],
  )) {
    throw new ValidationError('assignedInstrumentManId must be an active Instrument Man on this project');
  }

  const nextStatus = ticket.status === 'APPROVED' && params.assignedInstrumentManId
    ? 'ASSIGNED' as const
    : ticket.status;
  if (nextStatus !== ticket.status) {
    assertValidTransition(ticket.workflowVariant, ticket.status, nextStatus);
  }
  const assignedAt = params.assignedInstrumentManId ? (ticket.assignedAt ?? new Date()) : ticket.assignedAt;
  const surveyLeadId = surveyActor ? params.surveyLeadId : ticket.surveyLeadId;

  await repo.patchTicket(db, params.tenantId, params.ticketId, {
    status: nextStatus,
    assignedAt,
    assignedPartyChiefId: params.assignedPartyChiefId,
    assignedInstrumentManId: params.assignedInstrumentManId,
    surveyLeadId,
  }, {
    expectedStatus: ticket.status,
    expectedRowVersion: ticket.rowVersion,
  });

  await db.query(
    `UPDATE ticket_assignment_history
     SET ended_at = NOW(), end_reason = 'REASSIGNED'
     WHERE tenant_id = $1 AND ticket_id = $2 AND ended_at IS NULL`,
    [params.tenantId, params.ticketId],
  );
  await db.query(
    `INSERT INTO ticket_assignment_history
       (tenant_id, ticket_id, party_chief_id, instrument_man_id, assigned_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.tenantId, params.ticketId, params.assignedPartyChiefId, params.assignedInstrumentManId, params.actorId],
  );

  await appendAuditEvent(db, {
    ticketId: params.ticketId,
    tenantId: params.tenantId,
    actorId: params.actorId,
    eventType: params.assignedInstrumentManId ? 'ticket.assigned' : 'ticket.party_chief_assigned',
    payload: {
      assignedPartyChiefId: params.assignedPartyChiefId,
      assignedInstrumentManId: params.assignedInstrumentManId,
    },
  });
  await enqueueRequesterNotification(db, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    requesterId: ticket.requesterId,
    eventType: params.assignedInstrumentManId ? 'ASSIGNED' : 'PARTY_CHIEF_ASSIGNED',
    payload: {
      assignedPartyChiefId: params.assignedPartyChiefId,
      assignedInstrumentManId: params.assignedInstrumentManId,
    },
    idempotencyKey: `${params.ticketId}:assignment:${ticket.rowVersion ?? 0}`,
  });

  return {
    ...ticket,
    status: nextStatus,
    assignedAt,
    assignedPartyChiefId: params.assignedPartyChiefId,
    assignedInstrumentManId: params.assignedInstrumentManId,
    surveyLeadId,
    rowVersion: (ticket.rowVersion ?? 0) + 1,
    updatedAt: new Date(),
  };
}
