/**
 * SubmitTicket — Variant 1 only (DRAFT → SUBMITTED).
 * Enforces project-configured minimum lead-time notice at submit time.
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

export async function submitTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
    departmentId?: UUID;
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

  if (!doesRequestedDateMeetLeadTime(ticket.requestedDate, new Date(), leadTimeConfig)) {
    const dayLabel = leadTimeConfig.leadTimeDays === 1 ? 'day' : 'days';
    throw new ValidationError(
      `Requested date must be at least ${leadTimeConfig.leadTimeDays} ${dayLabel} from now`,
    );
  }

  const aorNodeCode = await repo.findAorNodeCode(db, params.tenantId, ticket.aorNodeId);
  if (!aorNodeCode) throw new NotFoundError('AOR node not found');

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

  const sequence = await repo.nextSequence(db, ticket.projectId);
  const ticketNumber = `FSS-${aorNodeCode}-${String(sequence).padStart(5, '0')}`;
  const submittedAt = new Date();

  await repo.patchTicket(db, params.tenantId, params.ticketId, {
    status: 'SUBMITTED',
    departmentId: resolvedDepartmentId,
    priority: resolvedPriority,
    ticketNumber,
    submittedAt,
  }, {
    expectedStatus: ticket.status,
    expectedRowVersion: ticket.rowVersion,
  });

  await appendAuditEvent(db, {
    ticketId:  params.ticketId,
    tenantId:  params.tenantId,
    actorId:   params.actorId,
    eventType: 'ticket.submitted',
    payload:   { ticketNumber, departmentId: resolvedDepartmentId, priority: resolvedPriority },
  });

  if (isWhitelisted && requesterEmail) {
    await appendAuditEvent(db, {
      ticketId:  params.ticketId,
      tenantId:  params.tenantId,
      actorId:   params.actorId,
      eventType: 'ticket.priority_set_by_whitelist',
      payload:   { requesterEmail },
    });
  }

  return {
    ...ticket,
    status: 'SUBMITTED',
    departmentId: resolvedDepartmentId,
    priority: resolvedPriority,
    ticketNumber,
    submittedAt,
    rowVersion: (ticket.rowVersion ?? 0) + 1,
    updatedAt: new Date(),
  };
}
