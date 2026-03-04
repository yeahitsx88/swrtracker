import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';

const APPROVER_ROLES: readonly ProjectRole[] = [
  'PARTY_CHIEF',
  'SURVEY_SUPERINTENDENT',
  'SURVEY_MANAGER',
];

export async function approvePcStatus(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);

  if (!APPROVER_ROLES.includes(params.actorRole)) {
    throw new ForbiddenError('Only Party Chief or survey-side approvers may approve pending field status');
  }
  if (ticket.status !== 'PENDING_PC_APPROVAL' || !ticket.pendingPcOutcome) {
    throw new ConflictError('Ticket is not awaiting Party Chief approval');
  }

  const finalStatus = ticket.pendingPcOutcome;
  await repo.patchTicket(db, params.tenantId, params.ticketId, {
    status: finalStatus,
    pendingPcOutcome: null,
    pendingPcReason: null,
    completedAt: finalStatus === 'COMPLETED' ? new Date() : undefined,
  });

  if (params.actorRole !== 'PARTY_CHIEF') {
    await appendAuditEvent(db, {
      ticketId: params.ticketId,
      tenantId: params.tenantId,
      actorId: params.actorId,
      eventType: 'ticket.pc_approval_overridden',
      payload: { finalStatus, actorRole: params.actorRole },
    });
  }

  await appendAuditEvent(db, {
    ticketId: params.ticketId,
    tenantId: params.tenantId,
    actorId: params.actorId,
    eventType: 'ticket.pc_approval_given',
    payload: {
      finalStatus,
      pendingReason: ticket.pendingPcReason,
    },
  });

  const finalEventType =
    finalStatus === 'COMPLETED'
      ? 'ticket.completed'
      : finalStatus === 'DELAYED'
        ? 'ticket.delayed'
        : 'ticket.field_canceled';

  await appendAuditEvent(db, {
    ticketId: params.ticketId,
    tenantId: params.tenantId,
    actorId: params.actorId,
    eventType: finalEventType,
    payload: finalStatus === 'FIELD_CANCELED'
      ? { responderRole: params.actorRole, reason: ticket.pendingPcReason }
      : { reason: ticket.pendingPcReason },
  });

  return {
    ...ticket,
    status: finalStatus,
    pendingPcOutcome: null,
    pendingPcReason: null,
    completedAt: finalStatus === 'COMPLETED' ? new Date() : ticket.completedAt,
    updatedAt: new Date(),
  };
}
