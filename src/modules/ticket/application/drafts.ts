import { randomUUID } from 'node:crypto';
import { appendAuditEvent } from '@/modules/audit/application/index';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, Page, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { Ticket, TicketType } from '../domain/types';
import type { ITicketRepository } from './ports';

export interface DraftFields {
  aorNodeId?: UUID | null;
  departmentId?: UUID | null;
  ticketType?: TicketType | null;
  craft?: string | null;
  description?: string | null;
  requestedDate?: Date | null;
}

export async function saveDraft(repo: ITicketRepository, db: DbClient, params: {
  tenantId: UUID; projectId: UUID; requesterId: UUID; companyId: UUID;
  ticketId?: UUID; parentTicketId?: UUID; fields: DraftFields;
}): Promise<Ticket> {
  if (!(await repo.isDraftOwnerAllowed(db, params.tenantId, params.projectId,
    params.requesterId, params.companyId))) {
    throw new ForbiddenError('Active project membership and company ownership are required');
  }
  const now = new Date();
  if (params.ticketId) {
    const draft = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
    if (!draft || draft.projectId !== params.projectId || draft.requesterId !== params.requesterId ||
        draft.companyId !== params.companyId) throw new NotFoundError('Draft not found');
    if (draft.status !== 'DRAFT' || draft.draftDeletedAt) {
      throw new ConflictError('Only an active draft may be saved');
    }
    const patch = { status: 'DRAFT' as const, ...params.fields, draftLastSavedAt: now };
    await repo.patchTicket(db, params.tenantId, draft.id, patch);
    await appendAuditEvent(db, { ticketId: draft.id, tenantId: params.tenantId,
      actorId: params.requesterId, eventType: 'ticket.draft_saved', payload: {} });
    return { ...draft, ...params.fields, draftLastSavedAt: now, updatedAt: now };
  }
  const parent = params.parentTicketId ? await repo.findRejectedParent(db,
    params.tenantId, params.projectId, params.requesterId, params.parentTicketId) : null;
  if (params.parentTicketId && !parent) {
    throw new ValidationError('Rejected parent ticket not found for requester');
  }
  const fields: DraftFields = parent ? {
    aorNodeId: parent.aorNodeId, departmentId: parent.departmentId,
    ticketType: parent.ticketType, craft: parent.craft,
    description: parent.description, ...params.fields,
  } : params.fields;
  const draft: Ticket = {
    id: randomUUID() as UUID, tenantId: params.tenantId, projectId: params.projectId,
    areaId: null, subareaId: null, aorNodeId: fields.aorNodeId ?? null,
    departmentId: fields.departmentId ?? null, companyId: params.companyId,
    ticketNumber: null, ticketType: fields.ticketType ?? null,
    requesterId: params.requesterId, assignedPartyChiefId: null,
    assignedInstrumentManId: null, surveyLeadId: null,
    surveySuperintendentId: null, surveyManagerId: null,
    workflowVariant: 'STANDARD_APPROVAL', status: 'DRAFT',
    craft: fields.craft ?? null, description: fields.description ?? null,
    requestedDate: fields.requestedDate ?? null,
    draftLastSavedAt: now, draftDeletedAt: null, draftDeletedReason: null,
    submittedAt: null, approvedAt: null, assignedAt: null, startedAt: null,
    completedAt: null, closedAt: null, canceledAt: null,
    pendingFieldStatus: null, pendingFieldReason: null, pendingFieldInitiatedBy: null,
    delayedReason: null, cancelReason: null, cancelInitiatedBy: null,
    cancelInitiatedAt: null, cancelInitiatorRole: null, cancelApprovedBy: null,
    rejectionReason: null, rejectedAt: null, parentTicketId: parent?.id ?? null,
    priority: 'NORMAL', prioritySetBy: null,
    prioritySetReason: null, priorityElevatedBy: null,
    priorityElevatedReason: null, createdAt: now, updatedAt: now,
  };
  await repo.save(db, draft);
  await repo.saveCadWork(db, draft.id, draft.tenantId);
  await appendAuditEvent(db, { ticketId: draft.id, tenantId: params.tenantId,
    actorId: params.requesterId, eventType: 'ticket.created',
    payload: { workflowVariant: 'STANDARD_APPROVAL' } });
  await appendAuditEvent(db, { ticketId: draft.id, tenantId: params.tenantId,
    actorId: params.requesterId, eventType: 'ticket.draft_saved', payload: {} });
  return draft;
}

export async function deleteDraft(repo: ITicketRepository, db: DbClient, params: {
  tenantId: UUID; ticketId: UUID; requesterId: UUID;
}): Promise<Ticket> {
  const draft = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!draft || draft.requesterId !== params.requesterId) throw new NotFoundError('Draft not found');
  if (draft.status !== 'DRAFT' || draft.draftDeletedAt) {
    throw new ConflictError('Only an active draft may be deleted');
  }
  const when = new Date();
  await repo.patchTicket(db, params.tenantId, params.ticketId, { status: 'DRAFT',
    draftDeletedAt: when, draftDeletedReason: 'REQUESTER_DELETED' });
  await appendAuditEvent(db, { ticketId: draft.id, tenantId: params.tenantId,
    actorId: params.requesterId, eventType: 'ticket.draft_deleted',
    payload: { reason: 'REQUESTER_DELETED' } });
  return { ...draft, draftDeletedAt: when, draftDeletedReason: 'REQUESTER_DELETED' };
}

export async function recoverDraft(repo: ITicketRepository, db: DbClient, params: {
  tenantId: UUID; projectId: UUID; ticketId: UUID; actorId: UUID;
  actorRole: ProjectRole | TenantRole; reason: string;
}): Promise<Ticket> {
  if (params.actorRole !== 'PROJECT_ADMIN') throw new ForbiddenError('Project Admin required');
  const reason = params.reason.trim();
  if (reason.length < 10) throw new ValidationError('Recovery reason must have at least 10 characters');
  const company = await repo.findUserCompanyInfo(db, params.tenantId, params.actorId);
  if (!company) throw new ForbiddenError('Project Admin company not found');
  const draft = await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!draft || draft.projectId !== params.projectId) throw new NotFoundError('Draft not found');
  if (company.companyType === 'SUBCONTRACTOR' && draft.companyId !== company.companyId) {
    throw new NotFoundError('Draft not found');
  }
  if (draft.status !== 'DRAFT' || !draft.draftDeletedAt ||
      draft.draftDeletedAt.getTime() <= Date.now() - 30 * 24 * 60 * 60 * 1000) {
    throw new ConflictError('Draft is outside the recovery window');
  }
  await repo.patchTicket(db, params.tenantId, params.ticketId, { status: 'DRAFT',
    draftDeletedAt: null, draftDeletedReason: null });
  await appendAuditEvent(db, { ticketId: draft.id, tenantId: params.tenantId,
    actorId: params.actorId, eventType: 'ticket.draft_recovered',
    payload: { reason, priorDeletionReason: draft.draftDeletedReason } });
  return { ...draft, draftDeletedAt: null, draftDeletedReason: null };
}

export async function listRequesterDrafts(repo: ITicketRepository, db: DbClient,
  params: { tenantId: UUID; requesterId: UUID; limit: number; offset: number }): Promise<Page<Ticket>> {
  return repo.listDrafts(db, params.tenantId, params.requesterId, params.limit, params.offset);
}

export async function listRecoverableDrafts(repo: ITicketRepository, db: DbClient,
  params: { tenantId: UUID; projectId: UUID; actorRole: ProjectRole | TenantRole;
    actorId: UUID; limit: number; offset: number }): Promise<Page<Ticket>> {
  if (params.actorRole !== 'PROJECT_ADMIN') throw new ForbiddenError('Project Admin required');
  return repo.listDeletedDrafts(db, params.tenantId, params.projectId, params.actorId,
    params.limit, params.offset);
}
