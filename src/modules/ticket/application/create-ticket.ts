/**
 * CreateTicket use case — both Variant 1 (STANDARD_APPROVAL) and Variant 2 (DIRECT_ASSIGNMENT).
 *
 * - Direct tickets claim a sequence at creation; drafts claim it at submission.
 * - Checks the priority whitelist and sets HIGH priority if the requester's email matches.
 * - Creates the cad_work row with cad_status = NOT_REQUIRED.
 * - Logs ticket.created (and ticket.priority_set_by_whitelist if applicable).
 * - Variant 1 initial status: DRAFT
 * - Variant 2 initial status: CREATED
 *
 * The caller (route handler) must wrap this in withTransaction.
 */
import { randomUUID } from 'crypto';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { WorkflowVariant } from '@/modules/workflow/domain/transitions';
import type { Ticket, TicketType } from '../domain/types';
import type { ITicketRepository } from './ports';

export interface CreateTicketParams {
  tenantId:        UUID;
  projectId:       UUID;
  aorNodeId:       UUID;
  companyId:       UUID;
  requesterId:     UUID;
  requesterEmail:  string;
  ticketType:      TicketType;
  workflowVariant: WorkflowVariant;
  craft:           string;
  description:     string;
  requestedDate:   Date;
  parentTicketId?: UUID;
  departmentId?: UUID;
  /** If true, requester email was already confirmed in the priority whitelist by the route handler. */
  isWhitelisted?:  boolean;
}

export async function createTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: CreateTicketParams,
): Promise<Ticket> {
  if (params.parentTicketId && !(await repo.findRejectedParent(db, params.tenantId,
    params.projectId, params.requesterId, params.parentTicketId))) {
    throw new ValidationError('Rejected parent ticket not found for requester');
  }
  // AOR code is required for ticket numbering
  const aorCode = await repo.findCreationAorCode(db, params);
  if (!aorCode) throw new NotFoundError('Ticket resources not found for requester');
  const department = await repo.resolveCreationDepartment(db, {
    tenantId: params.tenantId, projectId: params.projectId,
    requesterId: params.requesterId, selectedDepartmentId: params.departmentId,
  });
  if (!department) throw new ValidationError('A valid project department is required');

  // Requested date must be a valid date (checked here; 48h rule enforced at submit)
  if (isNaN(params.requestedDate.getTime())) {
    throw new ValidationError('requestedDate is not a valid date');
  }

  const isDraft = params.workflowVariant === 'STANDARD_APPROVAL';
  const seq = isDraft ? null : await repo.nextSequence(db, params.projectId);
  const ticketNumber = seq === null ? null : `FSS-${aorCode}-${String(seq).padStart(5, '0')}`;

  const isPriority = !isDraft && params.isWhitelisted === true;
  const now = new Date();

  const ticket: Ticket = {
    id:                     randomUUID() as UUID,
    tenantId:               params.tenantId,
    projectId:              params.projectId,
    areaId:                 null,
    subareaId:              null,
    aorNodeId:              params.aorNodeId,
    departmentId:           department.departmentId,
    companyId:              params.companyId,
    ticketNumber,
    ticketType:             params.ticketType,
    requesterId:            params.requesterId,
    assignedPartyChiefId:   null,
    assignedInstrumentManId: null,
    surveyLeadId:           null,
    surveySuperintendentId: null,
    surveyManagerId:        null,
    workflowVariant:        params.workflowVariant,
    status:                 isDraft ? 'DRAFT' : 'CREATED',
    craft:                  params.craft,
    description:            params.description,
    requestedDate:          params.requestedDate,
    draftLastSavedAt:       isDraft ? now : null,
    draftDeletedAt:         null,
    draftDeletedReason:     null,
    submittedAt:            null,
    approvedAt:             null,
    assignedAt:             null,
    startedAt:              null,
    completedAt:            null,
    closedAt:               null,
    canceledAt:             null,
    pendingFieldStatus:     null,
    pendingFieldReason:     null,
    pendingFieldInitiatedBy: null,
    delayedReason:          null,
    cancelReason:           null,
    cancelInitiatedBy:      null,
    cancelInitiatedAt:      null,
    cancelInitiatorRole:    null,
    cancelApprovedBy:       null,
    rejectionReason:        null,
    rejectedAt:             null,
    parentTicketId:         params.parentTicketId ?? null,
    priority:               isDraft ? 'NORMAL' : isPriority ? 'HIGH' : department.priority,
    prioritySetBy:          null,
    prioritySetReason:      null,
    priorityElevatedBy:     null,
    priorityElevatedReason: null,
    createdAt:              now,
    updatedAt:              now,
  };

  await repo.save(db, ticket);
  await repo.saveCadWork(db, ticket.id, ticket.tenantId);

  await appendAuditEvent(db, {
    ticketId:  ticket.id,
    tenantId:  ticket.tenantId,
    actorId:   params.requesterId,
    eventType: 'ticket.created',
    payload:   { ticketNumber, workflowVariant: params.workflowVariant },
  });

  if (isDraft) {
    await appendAuditEvent(db, { ticketId: ticket.id, tenantId: ticket.tenantId,
      actorId: params.requesterId, eventType: 'ticket.draft_saved', payload: {} });
  }

  if (isPriority) {
    await appendAuditEvent(db, {
      ticketId:  ticket.id,
      tenantId:  ticket.tenantId,
      actorId:   params.requesterId,
      eventType: 'ticket.priority_set_by_whitelist',
      payload:   { requesterEmail: params.requesterEmail },
    });
  }

  return ticket;
}
