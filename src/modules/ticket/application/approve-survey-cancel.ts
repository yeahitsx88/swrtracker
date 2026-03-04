import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { performTransition } from './shared';

function assertApprovalChain(
  actorRole: ProjectRole,
  requestedRole: string | null,
): void {
  if (requestedRole === 'PARTY_CHIEF') {
    if (actorRole !== 'SURVEY_SUPERINTENDENT' && actorRole !== 'SURVEY_MANAGER') {
      throw new ForbiddenError('Party Chief survey-cancel requests require Survey Superintendent or Survey Manager approval');
    }
    return;
  }

  if (requestedRole === 'SURVEY_SUPERINTENDENT') {
    if (actorRole !== 'SURVEY_MANAGER') {
      throw new ForbiddenError('Survey Superintendent survey-cancel requests require Survey Manager approval');
    }
    return;
  }

  throw new ConflictError('No pending survey-side cancellation request found');
}

export async function approveSurveyCancel(
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
  const originalTicket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!originalTicket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);

  assertApprovalChain(params.actorRole, originalTicket.surveyCancelRequestedRole);

  const reason = originalTicket.surveyCancelReason ?? '';
  const ticket = await performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['SURVEY_SUPERINTENDENT', 'SURVEY_MANAGER'],
    to:             'SURVEY_CANCELED',
    patch:          {
      pendingPcOutcome: null,
      pendingPcReason: null,
      surveyCancelRequestedBy: null,
      surveyCancelRequestedRole: null,
      surveyCancelReason: null,
      surveyCancelRequestedAt: null,
    },
    eventType:    'ticket.survey_canceled',
    eventPayload: {
      reason,
      requestedBy: originalTicket.surveyCancelRequestedBy,
      requestedByRole: originalTicket.surveyCancelRequestedRole,
      approverRole: params.actorRole,
    },
    visibility: params.visibility,
  });

  if (originalTicket.status === 'IN_PROGRESS') {
    await appendAuditEvent(db, {
      ticketId: params.ticketId,
      tenantId: params.tenantId,
      actorId: params.actorId,
      eventType: 'ticket.im_stop_work_notified',
      payload: { reason },
    });
  }

  return ticket;
}
