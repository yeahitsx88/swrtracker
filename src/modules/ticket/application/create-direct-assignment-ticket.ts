/**
 * CreateDirectAssignmentTicket — Variant 2 entry point.
 *
 * Creates the ticket directly in ASSIGNED status with immediate crew context,
 * bypassing requester draft semantics and the approval gate.
 */
import { randomUUID } from 'crypto';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket, TicketType } from '../domain/types';
import type { ITicketRepository } from './ports';
import { assertActorHasRole } from './shared';

export interface CreateDirectAssignmentTicketParams {
  tenantId:                UUID;
  projectId:               UUID;
  aorNodeId:               UUID;
  requesterId:             UUID;
  actorId:                 UUID;
  actorRole:               ProjectRole;
  assignedPartyChiefId:    UUID | null;
  assignedInstrumentManId: UUID;
  departmentId?:           UUID;
  ticketType:              TicketType;
  craft:                   string;
  fieldContact?:           string | null;
  fieldChannel?:           string | null;
  description:             string;
  requestedDate:           Date;
}

export async function createDirectAssignmentTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: CreateDirectAssignmentTicketParams,
): Promise<Ticket> {
  assertActorHasRole(params.actorRole, ['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT']);

  if (!params.assignedInstrumentManId) {
    throw new ValidationError('assignedInstrumentManId is required');
  }

  if (isNaN(params.requestedDate.getTime())) {
    throw new ValidationError('requestedDate is not a valid date');
  }

  const companyInfo = await repo.findUserCompanyInfo(db, params.tenantId, params.requesterId);
  if (!companyInfo) {
    throw new ForbiddenError('Requester is missing company context');
  }

  if (!repo.isActiveProjectMemberWithRole) {
    throw new Error('Ticket repository does not support assignment eligibility checks');
  }
  if (params.assignedPartyChiefId && !await repo.isActiveProjectMemberWithRole(
    db, params.tenantId, params.projectId, params.assignedPartyChiefId, ['PARTY_CHIEF'],
  )) {
    throw new ValidationError('assignedPartyChiefId must be an active Party Chief on this project');
  }
  if (!await repo.isActiveProjectMemberWithRole(
    db, params.tenantId, params.projectId, params.assignedInstrumentManId, ['INSTRUMENT_MAN'],
  )) {
    throw new ValidationError('assignedInstrumentManId must be an active Instrument Man on this project');
  }

  const aorNodeCode = await repo.findAorNodeCode(db, params.tenantId, params.aorNodeId);
  if (!aorNodeCode) {
    throw new NotFoundError('AOR node not found');
  }

  const requesterEmail = await repo.findUserEmail(db, params.tenantId, params.requesterId);
  const isWhitelisted = requesterEmail
    ? await repo.isEmailWhitelisted(db, params.tenantId, params.projectId, requesterEmail)
    : false;
  const membership = await repo.findRequesterDepartmentMembership(
    db,
    params.tenantId,
    params.projectId,
    params.requesterId,
  );

  let resolvedDepartmentId: UUID | null = params.departmentId ?? null;
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
    if (!resolvedDepartmentId) {
      throw new ValidationError('departmentId is required when requester has no department membership');
    }
    const department = await repo.findDepartmentById(
      db,
      params.tenantId,
      params.projectId,
      resolvedDepartmentId,
    );
    if (!department) {
      throw new ValidationError('departmentId must reference a department in this project');
    }
    resolvedDepartmentId = department.id;
  }

  if (isWhitelisted) {
    resolvedPriority = 'HIGH';
  }

  const now = new Date();
  const sequence = await repo.nextSequence(db, params.projectId);
  const ticketNumber = `FSS-${aorNodeCode}-${String(sequence).padStart(5, '0')}`;

  const ticket: Ticket = {
    id:                      randomUUID() as UUID,
    tenantId:                params.tenantId,
    projectId:               params.projectId,
    aorNodeId:               params.aorNodeId,
    departmentId:            resolvedDepartmentId,
    companyId:               companyInfo.companyId,
    ticketNumber,
    ticketType:              params.ticketType,
    requesterId:             params.requesterId,
    assignedPartyChiefId:    params.assignedPartyChiefId,
    assignedInstrumentManId: params.assignedInstrumentManId,
    surveyLeadId:            params.actorId,
    workflowVariant:         'DIRECT_ASSIGNMENT',
    status:                  'ASSIGNED',
    craft:                   params.craft,
    fieldContact:            params.fieldContact ?? null,
    fieldChannel:            params.fieldChannel ?? null,
    description:             params.description,
    requestedDate:           params.requestedDate,
    submittedAt:             null,
    approvedAt:              null,
    assignedAt:              now,
    startedAt:               null,
    pendingPcOutcome:        null,
    pendingPcReason:         null,
    surveyCancelRequestedBy: null,
    surveyCancelRequestedRole: null,
    surveyCancelReason:      null,
    surveyCancelRequestedAt: null,
    completedAt:             null,
    closedAt:                null,
    rejectionReason:         null,
    parentTicketId:          null,
    priority:                resolvedPriority,
    prioritySetBy:           null,
    prioritySetReason:       null,
    createdAt:               now,
    updatedAt:               now,
  };

  await repo.save(db, ticket);
  await repo.saveCadWork(db, ticket.id, ticket.tenantId);
  await db.query(
    `INSERT INTO ticket_assignment_history
       (tenant_id, ticket_id, party_chief_id, instrument_man_id, assigned_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.tenantId, ticket.id, params.assignedPartyChiefId, params.assignedInstrumentManId, params.actorId],
  );

  await appendAuditEvent(db, {
    ticketId:  ticket.id,
    tenantId:  ticket.tenantId,
    actorId:   params.actorId,
    eventType: 'ticket.created',
    payload:   { workflowVariant: ticket.workflowVariant, ticketNumber },
  });

  await appendAuditEvent(db, {
    ticketId:  ticket.id,
    tenantId:  ticket.tenantId,
    actorId:   params.actorId,
    eventType: 'ticket.assigned',
    payload:   {
      assignedPartyChiefId: params.assignedPartyChiefId,
      assignedInstrumentManId: params.assignedInstrumentManId,
    },
  });

  if (isWhitelisted && requesterEmail) {
    await appendAuditEvent(db, {
      ticketId:  ticket.id,
      tenantId:  ticket.tenantId,
      actorId:   params.actorId,
      eventType: 'ticket.priority_set_by_whitelist',
      payload:   { requesterEmail },
    });
  }

  return ticket;
}
