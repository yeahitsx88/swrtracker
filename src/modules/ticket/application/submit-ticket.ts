/**
 * SubmitTicket — Variant 1 only (DRAFT → SUBMITTED).
 * Enforces the 48-hour minimum notice rule (CLAUDE.md §4 and §6).
 * Only the ticket's own REQUESTER may submit.
 */
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository } from './ports';
import { performTransition } from './shared';
import { appendAuditEvent } from '@/modules/audit/application/index';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export async function submitTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId:  UUID;
    ticketId:  UUID;
    actorId:   UUID;
    actorRole: ProjectRole;
    isWhitelisted?: boolean;
  },
): Promise<Ticket> {
  if (params.actorRole !== 'REQUESTER') {
    throw new ForbiddenError('Only REQUESTER may submit a ticket');
  }

  // Fetch ticket first to enforce the 48-hour rule
  const ticket = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);

  // REQUESTER can only submit their own tickets
  if (ticket.requesterId !== params.actorId) {
    throw new ForbiddenError('You can only submit your own tickets');
  }
  if (ticket.status !== 'DRAFT' || ticket.draftDeletedAt) {
    throw new ConflictError('Only an active draft may be submitted');
  }
  if (!ticket.aorNodeId || !ticket.ticketType || !ticket.craft?.trim() ||
      !ticket.description?.trim() || !ticket.requestedDate || !ticket.departmentId) {
    throw new ValidationError('Draft is missing required submission fields');
  }

  const now = Date.now();
  if (ticket.requestedDate.getTime() < now + FORTY_EIGHT_HOURS_MS) {
    throw new ValidationError(
      'Requested date must be at least 48 hours from now (CLAUDE.md §4 — The 48-Hour Rule)',
    );
  }

  const department = ticket.departmentId
    ? await repo.resolveCreationDepartment(db, { tenantId: params.tenantId,
      projectId: ticket.projectId, requesterId: ticket.requesterId }) ??
      await repo.resolveCreationDepartment(db, { tenantId: params.tenantId,
        projectId: ticket.projectId, requesterId: ticket.requesterId,
        selectedDepartmentId: ticket.departmentId })
    : null;
  if (ticket.departmentId && !department) {
    throw new ValidationError('Ticket department is no longer valid');
  }
  const parent = ticket.parentTicketId ? await repo.findRejectedParent(db,
    ticket.tenantId, ticket.projectId, ticket.requesterId, ticket.parentTicketId) : null;
  if (ticket.parentTicketId && !parent) {
    throw new ValidationError('Rejected parent ticket is no longer valid');
  }
  const aorCode = await repo.findCreationAorCode(db, {
    tenantId: ticket.tenantId, projectId: ticket.projectId,
    aorNodeId: ticket.aorNodeId, companyId: ticket.companyId,
    requesterId: ticket.requesterId,
    allowRetired: parent?.aorNodeId === ticket.aorNodeId,
  });
  if (!aorCode) throw new ValidationError('Draft AOR or requester is no longer active');
  const isPriority = params.isWhitelisted === true;
  const priority = isPriority ? 'HIGH' : department?.priority ?? 'NORMAL';
  const seq = await repo.nextSequence(db, ticket.projectId);
  const ticketNumber = `FSS-${aorCode}-${String(seq).padStart(5, '0')}`;
  const result = await performTransition(db, repo, {
    tenantId:       params.tenantId,
    ticketId:       params.ticketId,
    actorId:        params.actorId,
    actorRole:      params.actorRole,
    permittedRoles: ['REQUESTER'],
    to:             'SUBMITTED',
    patch:          { submittedAt: new Date(), priority, ticketNumber,
      departmentId: department?.departmentId ?? ticket.departmentId },
    eventType:      'ticket.submitted',
    eventPayload:   { ticketNumber },
  });
  if (isPriority) {
    await appendAuditEvent(db, { ticketId: ticket.id, tenantId: ticket.tenantId,
      actorId: params.actorId, eventType: 'ticket.priority_set_by_whitelist',
      payload: { ticketNumber } });
  } else if (department?.priority !== 'NORMAL') {
    await appendAuditEvent(db, { ticketId: ticket.id, tenantId: ticket.tenantId,
      actorId: params.actorId, eventType: 'ticket.priority_set_by_title',
      payload: { priority, departmentId: department?.departmentId } });
  }
  return result;
}
