/**
 * CreateTicket use case — both Variant 1 (STANDARD_APPROVAL) and Variant 2 (DIRECT_ASSIGNMENT).
 *
 * - Atomically claims the next ticket sequence within the transaction.
 * - Checks the priority whitelist and sets is_priority if the requester's email matches.
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
  areaId:          UUID;
  subareaId:       UUID;
  companyId:       UUID;
  requesterId:     UUID;
  requesterEmail:  string;
  ticketType:      TicketType;
  workflowVariant: WorkflowVariant;
  craft:           string;
  description:     string;
  requestedDate:   Date;
  parentTicketId?: UUID;
  /** If true, requester email was already confirmed in the priority whitelist by the route handler. */
  isWhitelisted?:  boolean;
}

export async function createTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: CreateTicketParams,
): Promise<Ticket> {
  // Area code is required for ticket numbering
  const areaCode = await repo.findAreaCode(db, params.tenantId, params.areaId);
  if (!areaCode) throw new NotFoundError('Area not found');

  // Requested date must be a valid date (checked here; 48h rule enforced at submit)
  if (isNaN(params.requestedDate.getTime())) {
    throw new ValidationError('requestedDate is not a valid date');
  }

  // Claim the next sequence number atomically
  const seq = await repo.nextSequence(db, params.projectId);
  const ticketNumber = `FSS-${areaCode}-${String(seq).padStart(5, '0')}`;

  const isPriority = params.isWhitelisted === true;
  const now = new Date();

  const ticket: Ticket = {
    id:                     randomUUID() as UUID,
    tenantId:               params.tenantId,
    projectId:              params.projectId,
    areaId:                 params.areaId,
    subareaId:              params.subareaId,
    companyId:              params.companyId,
    ticketNumber,
    ticketType:             params.ticketType,
    requesterId:            params.requesterId,
    assignedPartyChiefId:   null,
    assignedInstrumentManId: null,
    surveyLeadId:           null,
    workflowVariant:        params.workflowVariant,
    status:                 params.workflowVariant === 'STANDARD_APPROVAL' ? 'DRAFT' : 'CREATED',
    craft:                  params.craft,
    description:            params.description,
    requestedDate:          params.requestedDate,
    submittedAt:            null,
    approvedAt:             null,
    assignedAt:             null,
    startedAt:              null,
    completedAt:            null,
    closedAt:               null,
    rejectionReason:        null,
    parentTicketId:         params.parentTicketId ?? null,
    isPriority,
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
