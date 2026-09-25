import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';
import { enqueueAssignedFieldNotifications, enqueueRequesterNotification } from './amelia-notifications';

export type ReturnOrigin = 'INITIAL_REVIEW' | 'SURVEY_CHANGE' | 'FIELD_INABILITY';

export async function returnTicketForCorrection(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    ticketId: UUID;
    actorId: UUID;
    actorRole: ProjectRole;
    reason: string;
    origin: ReturnOrigin;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  const reason = params.reason.trim();
  if (!reason) throw new ValidationError('reason is required when returning an SWR');

  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);

  if (params.origin === 'FIELD_INABILITY') {
    if (ticket.status !== 'PENDING_FIELD_VALIDATION') {
      throw new ConflictError('This SWR is not awaiting field-inability validation');
    }
    if (ticket.fieldValidationReviewerId !== params.actorId ||
        !['PARTY_CHIEF', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT'].includes(params.actorRole)) {
      throw new ForbiddenError('Only the captured field-inability reviewer may validate this return');
    }
  } else if (params.actorRole !== 'SURVEY_MANAGER') {
    throw new ForbiddenError('Only the Survey Lead may return an SWR for correction');
  }

  const origin: ReturnOrigin = params.origin === 'FIELD_INABILITY'
    ? 'FIELD_INABILITY'
    : ticket.status === 'SUBMITTED' || ticket.status === 'APPROVED'
      ? 'INITIAL_REVIEW'
      : 'SURVEY_CHANGE';

  const cycleNumber = (ticket.returnCycle ?? 0) + 1;
  const returned = await performTransition(db, repo, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    permittedRoles: params.origin === 'FIELD_INABILITY'
      ? ['PARTY_CHIEF', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT']
      : ['SURVEY_MANAGER'],
    to: 'RETURNED_FOR_CORRECTION',
    patch: {
      returnCycle: cycleNumber,
      assignedPartyChiefId: null,
      assignedInstrumentManId: null,
      assignedAt: null,
      startedAt: null,
      approvedAt: null,
      pendingPcOutcome: null,
      pendingPcReason: null,
      fieldValidationReviewerId: null,
    },
    eventType: 'ticket.returned_for_correction',
    eventPayload: { cycleNumber, origin, reason },
    visibility: params.visibility,
  });

  await db.query(
    `INSERT INTO ticket_return_cycles
       (tenant_id, ticket_id, cycle_number, origin, reason, returned_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [params.tenantId, params.ticketId, cycleNumber, origin, reason, params.actorId],
  );
  await db.query(
    `UPDATE ticket_assignment_history
     SET ended_at = NOW(), end_reason = 'RETURNED_FOR_CORRECTION'
     WHERE tenant_id = $1 AND ticket_id = $2 AND ended_at IS NULL`,
    [params.tenantId, params.ticketId],
  );
  await enqueueRequesterNotification(db, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    requesterId: ticket.requesterId,
    eventType: 'RETURNED_FOR_CORRECTION',
    payload: { cycleNumber, origin, reason },
    idempotencyKey: `${params.ticketId}:return:${cycleNumber}`,
  });
  await enqueueAssignedFieldNotifications(db, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    assignedPartyChiefId: ticket.assignedPartyChiefId,
    assignedInstrumentManId: ticket.assignedInstrumentManId,
    eventType: 'STOP_WORK_RETURNED',
    payload: { cycleNumber, origin, reason },
    idempotencyKey: `${params.ticketId}:return:${cycleNumber}:field`,
  });
  return returned;
}
