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
import type { DirectAssignmentAuthority, ITicketRepository } from './ports';
import { assertActorHasRole } from './shared';

export interface CreateDirectAssignmentTicketParams {
  tenantId:                UUID;
  projectId:               UUID;
  aorNodeId:               UUID;
  requesterId:             UUID;
  actorId:                 UUID;
  actorRole:               ProjectRole;
  sessionVersion?:         number;
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

/** Must also run before returning a cached creation response. No numbering/writes. */
export async function authorizeDirectAssignment(repo: ITicketRepository, db: DbClient, scope: DirectAssignmentAuthority): Promise<void> {
  assertActorHasRole(scope.actorRole, ['SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT']);
  if (!repo.lockDirectAssignmentAuthority || !await repo.lockDirectAssignmentAuthority(db, scope)) {
    throw new ForbiddenError('Current survey leadership and Area authority are required for direct assignment');
  }
}

export async function createDirectAssignmentTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: CreateDirectAssignmentTicketParams,
): Promise<Ticket> {
  await authorizeDirectAssignment(repo, db, params);

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
  if (!await repo.isActiveProjectMemberWithRole(
    db, params.tenantId, params.projectId, params.requesterId, ['REQUESTER'],
  )) {
    throw new ForbiddenError('Requester must have active Requester membership on this project');
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

  const aorNodeCode = await repo.findAorNodeCode(db, params.tenantId, params.projectId, params.aorNodeId);
  if (!aorNodeCode) {
    throw new NotFoundError('AOR node not found');
  }

  const membership = await repo.findRequesterDepartmentMembership(
    db,
    params.tenantId,
    params.projectId,
    params.requesterId,
  );

  let resolvedDepartmentId: UUID | null = params.departmentId ?? null;
  const resolvedPriority: Ticket['priority'] = 'NORMAL';

  if (membership) {
    resolvedDepartmentId = membership.departmentId;

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

  return ticket;
}
