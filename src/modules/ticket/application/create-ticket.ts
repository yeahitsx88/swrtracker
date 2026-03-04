/**
 * CreateTicket use case — requester draft creation for Variant 1 (STANDARD_APPROVAL).
 *
 * - Creates the cad_work row with cad_status = NOT_REQUIRED.
 * - Logs ticket.created.
 * - Variant 1 initial status: DRAFT
 * - Direct-assignment creation is intentionally rejected here; it must enter at ASSIGNED
 *
 * The caller (route handler) must wrap this in withTransaction.
 */
import { randomUUID } from 'crypto';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { WorkflowVariant } from '@/modules/workflow/domain/transitions';
import type { Ticket, TicketType } from '../domain/types';
import type { ITicketRepository } from './ports';

export interface CreateTicketParams {
  tenantId:        UUID;
  projectId:       UUID;
  aorNodeId:       UUID;
  departmentId?:   UUID | null;
  companyId:       UUID;
  requesterId:     UUID;
  ticketType:      TicketType;
  workflowVariant: WorkflowVariant;
  craft:           string;
  description:     string;
  requestedDate:   Date;
  parentTicketId?: UUID;
}

export async function createTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: CreateTicketParams,
): Promise<Ticket> {
  if (params.workflowVariant !== 'STANDARD_APPROVAL') {
    throw new ValidationError(
      'Direct-assignment ticket creation requires an assignment-aware entry point',
    );
  }

  // Requested date must be a valid date (checked here; 48h rule enforced at submit)
  if (isNaN(params.requestedDate.getTime())) {
    throw new ValidationError('requestedDate is not a valid date');
  }

  const projectStatus = await repo.findProjectStatus(db, params.tenantId, params.projectId);
  if (!projectStatus) {
    throw new NotFoundError('Project not found');
  }
  if (projectStatus === 'ARCHIVED') {
    throw new ConflictError('Archived projects are read-only');
  }

  const now = new Date();

  const ticket: Ticket = {
    id:                     randomUUID() as UUID,
    tenantId:               params.tenantId,
    projectId:              params.projectId,
    aorNodeId:              params.aorNodeId,
    departmentId:           params.departmentId ?? null,
    companyId:              params.companyId,
    ticketNumber:           null,
    ticketType:             params.ticketType,
    requesterId:            params.requesterId,
    assignedPartyChiefId:   null,
    assignedInstrumentManId: null,
    surveyLeadId:           null,
    workflowVariant:        params.workflowVariant,
    status:                 'DRAFT',
    craft:                  params.craft,
    description:            params.description,
    requestedDate:          params.requestedDate,
    submittedAt:            null,
    approvedAt:             null,
    assignedAt:             null,
    startedAt:              null,
    pendingPcOutcome:       null,
    pendingPcReason:        null,
    surveyCancelRequestedBy: null,
    surveyCancelRequestedRole: null,
    surveyCancelReason:     null,
    surveyCancelRequestedAt: null,
    completedAt:            null,
    closedAt:               null,
    rejectionReason:        null,
    parentTicketId:         params.parentTicketId ?? null,
    priority:               'NORMAL',
    prioritySetBy:          null,
    prioritySetReason:      null,
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
    payload:   { workflowVariant: params.workflowVariant },
  });

  return ticket;
}
