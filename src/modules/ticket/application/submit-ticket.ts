/**
 * SubmitTicket — Variant 1 only (DRAFT → SUBMITTED).
 * Requires an urgent reason when the requested date misses the configured lead-time notice.
 * Only the ticket's own REQUESTER may submit.
 */
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { assertActorHasRole } from './shared';
import {
  doesRequestedDateMeetLeadTime,
  normalizeProjectLeadTimeConfig,
} from '../domain/lead-time-policy';
import { assertValidTransition } from '@/modules/workflow/domain/transitions';
import { enqueueRequesterNotification } from './amelia-notifications';

export async function submitTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
    departmentId?: UUID;
    urgentReason?: string;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  if (params.actorRole !== 'REQUESTER') {
    throw new ForbiddenError('Only REQUESTER may submit a ticket');
  }

  // Fetch ticket first to enforce submit-time lead-time policy
  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);
  if (ticket.status !== 'DRAFT' && ticket.status !== 'RETURNED_FOR_CORRECTION') {
    throw new ConflictError('Only draft or returned SWRs may be submitted');
  }
  assertValidTransition(ticket.workflowVariant, ticket.status, 'SUBMITTED');

  // REQUESTER can only submit their own tickets
  if (ticket.requesterId !== params.actorId) {
    throw new ForbiddenError('You can only submit your own tickets');
  }

  assertActorHasRole(params.actorRole, ['REQUESTER']);

  const projectStatus = await repo.findProjectStatus(db, params.tenantId, ticket.projectId);
  if (!projectStatus) {
    throw new NotFoundError('Project not found');
  }
  if (projectStatus === 'SETUP') {
    throw new ConflictError('Tickets cannot be submitted while the project is in SETUP');
  }
  if (projectStatus === 'ARCHIVED') {
    throw new ConflictError('Archived projects are read-only');
  }

  const leadTimeConfigRaw = repo.findProjectLeadTimeConfig
    ? await repo.findProjectLeadTimeConfig(db, params.tenantId, ticket.projectId)
    : null;
  const leadTimeConfig = normalizeProjectLeadTimeConfig(leadTimeConfigRaw);

  const missesLeadTime = !doesRequestedDateMeetLeadTime(ticket.requestedDate, new Date(), leadTimeConfig);
  const urgentReason = params.urgentReason?.trim() ?? '';
  if (missesLeadTime && !urgentReason) {
    const dayLabel = leadTimeConfig.leadTimeDays === 1 ? 'day' : 'days';
    throw new ValidationError(
      `Requested date must be at least ${leadTimeConfig.leadTimeDays} ${dayLabel} from now`,
    );
  }

  const isResubmission = ticket.status === 'RETURNED_FOR_CORRECTION';
  let ticketNumber = ticket.ticketNumber;
  if (!isResubmission) {
    const aorNodeCode = await repo.findAorNodeCode(db, params.tenantId, ticket.aorNodeId);
    if (!aorNodeCode) throw new NotFoundError('AOR node not found');
    const sequence = await repo.nextSequence(db, ticket.projectId);
    ticketNumber = `FSS-${aorNodeCode}-${String(sequence).padStart(5, '0')}`;
  }
  if (!ticketNumber) throw new ConflictError('Returned SWR is missing its durable ticket number');

  const requesterEmail = await repo.findUserEmail(db, params.tenantId, ticket.requesterId);
  const isWhitelisted = requesterEmail
    ? await repo.isEmailWhitelisted(db, params.tenantId, ticket.projectId, requesterEmail)
    : false;
  const membership = await repo.findRequesterDepartmentMembership(
    db,
    params.tenantId,
    ticket.projectId,
    ticket.requesterId,
  );

  let resolvedDepartmentId: UUID | null = ticket.departmentId;
  let resolvedPriority: Ticket['priority'] = 'NORMAL';

  if (membership) {
    resolvedDepartmentId = membership.departmentId;
    if (membership.title) {
      const membershipPriority = await repo.findDepartmentTitlePriority(
        db,
        params.tenantId,
        membership.departmentId,
        membership.title,
      );
      if (!membershipPriority) {
        throw new ValidationError('Assigned department title is not configured for submission');
      }
      resolvedPriority = membershipPriority;
    }
  } else {
    const manualDepartmentId = params.departmentId ?? ticket.departmentId;
    if (!manualDepartmentId) {
      throw new ValidationError('departmentId is required when requester has no department membership');
    }
    const manualDepartment = await repo.findDepartmentById(
      db,
      params.tenantId,
      ticket.projectId,
      manualDepartmentId,
    );
    if (!manualDepartment) {
      throw new ValidationError('departmentId must reference a department in this project');
    }
    resolvedDepartmentId = manualDepartment.id;
  }

  if (isWhitelisted) {
    resolvedPriority = 'HIGH';
  }

  const submittedAt = new Date();
  const firstSubmittedAt = ticket.firstSubmittedAt ?? submittedAt;
  const originalRequestedDate = ticket.originalRequestedDate ?? ticket.requestedDate;

  await repo.patchTicket(db, params.tenantId, params.ticketId, {
    status: 'SUBMITTED',
    departmentId: resolvedDepartmentId,
    priority: resolvedPriority,
    ticketNumber,
    submittedAt,
    firstSubmittedAt,
    originalRequestedDate,
  }, {
    expectedStatus: ticket.status,
    expectedRowVersion: ticket.rowVersion,
  });

  await appendAuditEvent(db, {
    ticketId:  params.ticketId,
    tenantId:  params.tenantId,
    actorId:   params.actorId,
    eventType: isResubmission ? 'ticket.resubmitted' : 'ticket.submitted',
    payload:   { ticketNumber, departmentId: resolvedDepartmentId, priority: resolvedPriority,
      returnCycle: ticket.returnCycle ?? 0, urgentReason: missesLeadTime ? urgentReason : null },
  });

  if (missesLeadTime) {
    await appendAuditEvent(db, {
      ticketId: params.ticketId,
      tenantId: params.tenantId,
      actorId: params.actorId,
      eventType: 'ticket.urgent_request_submitted',
      payload: { requestedDate: ticket.requestedDate.toISOString(), leadTimeDays: leadTimeConfig.leadTimeDays, reason: urgentReason },
    });
  }

  if (isResubmission) {
    await db.query(
      `UPDATE ticket_return_cycles
       SET resubmitted_at = $3
       WHERE tenant_id = $1 AND ticket_id = $2 AND cycle_number = $4 AND resubmitted_at IS NULL`,
      [params.tenantId, params.ticketId, submittedAt, ticket.returnCycle ?? 0],
    );
  }
  if (isWhitelisted && requesterEmail) {
    await appendAuditEvent(db, {
      ticketId:  params.ticketId,
      tenantId:  params.tenantId,
      actorId:   params.actorId,
      eventType: 'ticket.priority_set_by_whitelist',
      payload:   { requesterEmail },
    });
  }
  await enqueueRequesterNotification(db, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    requesterId: ticket.requesterId,
    eventType: isResubmission ? 'RESUBMITTED' : 'SUBMITTED',
    payload: { ticketNumber, returnCycle: ticket.returnCycle ?? 0, urgentReason: missesLeadTime ? urgentReason : null },
    idempotencyKey: `${params.ticketId}:submit:${ticket.returnCycle ?? 0}`,
  });

  return {
    ...ticket,
    status: 'SUBMITTED',
    departmentId: resolvedDepartmentId,
    priority: resolvedPriority,
    ticketNumber,
    submittedAt,
    firstSubmittedAt,
    originalRequestedDate,
    rowVersion: (ticket.rowVersion ?? 0) + 1,
    updatedAt: new Date(),
  };
}
