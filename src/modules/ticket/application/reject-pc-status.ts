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

export async function rejectPcStatus(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
    reason?:   string;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);

  if (!APPROVER_ROLES.includes(params.actorRole)) {
    throw new ForbiddenError('Only Party Chief or survey-side approvers may reject pending field status');
  }
  if (ticket.status !== 'PENDING_PC_APPROVAL' || !ticket.pendingPcOutcome) {
    throw new ConflictError('Ticket is not awaiting Party Chief approval');
  }

  await repo.patchTicket(db, params.tenantId, params.ticketId, {
    status: 'IN_PROGRESS',
    pendingPcOutcome: null,
    pendingPcReason: null,
  }, {
    expectedStatus: ticket.status,
    expectedRowVersion: ticket.rowVersion,
  });

  if (params.actorRole !== 'PARTY_CHIEF') {
    await appendAuditEvent(db, {
      ticketId: params.ticketId,
      tenantId: params.tenantId,
      actorId: params.actorId,
      eventType: 'ticket.pc_approval_overridden',
      payload: { rejected: true, actorRole: params.actorRole },
    });
  }

  await appendAuditEvent(db, {
    ticketId: params.ticketId,
    tenantId: params.tenantId,
    actorId: params.actorId,
    eventType: 'ticket.pc_approval_rejected',
    payload: {
      requestedStatus: ticket.pendingPcOutcome,
      reason: params.reason ?? null,
    },
  });

  return {
    ...ticket,
    status: 'IN_PROGRESS',
    pendingPcOutcome: null,
    pendingPcReason: null,
    rowVersion: (ticket.rowVersion ?? 0) + 1,
    updatedAt: new Date(),
  };
}
