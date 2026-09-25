import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { ConflictError, ForbiddenError } from '@/shared/errors';
import { uploadAttachment, type IAttachmentRepository } from '@/modules/attachment/application';
import type { Attachment } from '@/modules/attachment/domain/types';
import { handlePostTicketAttachments, type TicketAttachmentsRouteDeps } from '@/app/api/tickets/[ticketId]/attachments/handler';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const requesterId = 'requester-1' as UUID;
const managerId = 'manager-1' as UUID;
const pcId = 'pc-1' as UUID;
const imId = 'im-1' as UUID;
const sha = 'a'.repeat(64);

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  const now = new Date('2026-09-24T12:00:00Z');
  return {
    id: ticketId, tenantId, projectId, aorNodeId: 'aor-1' as UUID, departmentId: null,
    companyId: 'company-1' as UUID, ticketNumber: null, ticketType: 'LAYOUT', requesterId,
    assignedPartyChiefId: null, assignedInstrumentManId: null, surveyLeadId: managerId,
    workflowVariant: 'STANDARD_APPROVAL', status: 'DRAFT', craft: 'Civil', description: 'Attachment test',
    requestedDate: new Date('2026-10-01T00:00:00Z'), returnCycle: 0, submittedAt: null, approvedAt: null,
    assignedAt: null, startedAt: null, pendingPcOutcome: null, pendingPcReason: null,
    surveyCancelRequestedBy: null, surveyCancelRequestedRole: null, surveyCancelReason: null,
    surveyCancelRequestedAt: null, completedAt: null, closedAt: null, rejectionReason: null,
    parentTicketId: null, priority: 'NORMAL', prioritySetBy: null, prioritySetReason: null,
    createdAt: now, updatedAt: now, ...overrides,
  };
}

function db(onQuery?: (sql: string, params?: unknown[]) => void): DbClient {
  return { query: async (sql, params) => { onQuery?.(sql, params); return { rows: [] }; } };
}

function attachmentRepo(saved: Attachment[], limit: number | null = null, count = 0): IAttachmentRepository {
  return {
    saveAttachment: async (_db, value) => { saved.push(value); },
    countTicketAttachments: async () => count,
    findProjectAttachmentLimit: async () => limit,
  };
}

function metadata(purpose: 'REQUEST_INSTRUCTION' | 'FIELD_SUPPORT') {
  return {
    filename: purpose === 'REQUEST_INSTRUCTION' ? 'layout.pdf' : 'field.jpg',
    mimeType: purpose === 'REQUEST_INSTRUCTION' ? 'application/pdf' : 'image/jpeg',
    storageKey: `${tenantId}/${ticketId}/file-1`,
    sizeBytes: 2048,
    purpose,
    returnCycle: 0,
    contentSha256: sha,
  } as const;
}

test('request instructions are hashed, revision-bound, and limited to the owner draft or returned SWR', async () => {
  const saved: Attachment[] = [];
  const auditPayloads: Record<string, unknown>[] = [];
  const database = db((sql, params) => {
    if (/INSERT INTO ticket_events/.test(sql)) auditPayloads.push(JSON.parse(String(params?.[5])));
  });
  const attachment = await uploadAttachment(attachmentRepo(saved), database, {
    tenantId, projectId, ticketId, ticketRequesterId: requesterId, ticketStatus: 'DRAFT', ticketReturnCycle: 0,
    assignedPartyChiefId: null, assignedInstrumentManId: null, projectStatus: 'ACTIVE',
    actorId: requesterId, actorRole: 'REQUESTER', metadata: metadata('REQUEST_INSTRUCTION'),
  });
  assert.equal(saved.length, 1);
  assert.equal(attachment.contentSha256, sha);
  assert.equal(auditPayloads[0]?.purpose, 'REQUEST_INSTRUCTION');

  await assert.rejects(() => uploadAttachment(attachmentRepo([]), database, {
    tenantId, projectId, ticketId, ticketRequesterId: requesterId, ticketStatus: 'SUBMITTED', ticketReturnCycle: 0,
    assignedPartyChiefId: null, assignedInstrumentManId: null, projectStatus: 'ACTIVE',
    actorId: requesterId, actorRole: 'REQUESTER', metadata: metadata('REQUEST_INSTRUCTION'),
  }), ConflictError);
});

test('Survey Lead and assigned field staff can append field support while work is active', async () => {
  for (const [actorId, actorRole] of [
    [managerId, 'SURVEY_MANAGER'], [pcId, 'PARTY_CHIEF'], [imId, 'INSTRUMENT_MAN'],
  ] as const) {
    const saved: Attachment[] = [];
    await uploadAttachment(attachmentRepo(saved), db(), {
      tenantId, projectId, ticketId, ticketRequesterId: requesterId, ticketStatus: 'IN_PROGRESS', ticketReturnCycle: 0,
      assignedPartyChiefId: pcId, assignedInstrumentManId: imId, projectStatus: 'ACTIVE',
      actorId, actorRole, metadata: metadata('FIELD_SUPPORT'),
    });
    assert.equal(saved.length, 1);
  }

  await assert.rejects(() => uploadAttachment(attachmentRepo([]), db(), {
    tenantId, projectId, ticketId, ticketRequesterId: requesterId, ticketStatus: 'IN_PROGRESS', ticketReturnCycle: 0,
    assignedPartyChiefId: pcId, assignedInstrumentManId: imId, projectStatus: 'ACTIVE',
    actorId: 'other-im' as UUID, actorRole: 'INSTRUMENT_MAN', metadata: metadata('FIELD_SUPPORT'),
  }), ForbiddenError);
});

test('completed SWRs are sealed and configured attachment counts are enforced', async () => {
  await assert.rejects(() => uploadAttachment(attachmentRepo([]), db(), {
    tenantId, projectId, ticketId, ticketRequesterId: requesterId, ticketStatus: 'COMPLETED', ticketReturnCycle: 0,
    assignedPartyChiefId: pcId, assignedInstrumentManId: imId, projectStatus: 'ACTIVE',
    actorId: managerId, actorRole: 'SURVEY_MANAGER', metadata: metadata('FIELD_SUPPORT'),
  }), ConflictError);

  await assert.rejects(() => uploadAttachment(attachmentRepo([], 3, 3), db(), {
    tenantId, projectId, ticketId, ticketRequesterId: requesterId, ticketStatus: 'DRAFT', ticketReturnCycle: 0,
    assignedPartyChiefId: null, assignedInstrumentManId: null, projectStatus: 'ACTIVE',
    actorId: requesterId, actorRole: 'REQUESTER', metadata: metadata('REQUEST_INSTRUCTION'),
  }), /at most 3 attachments/);
});

function ticketRepo(current: Ticket): ITicketRepository {
  return {
    findById: async () => current, findByIdInternal: async () => current, save: async () => undefined,
    saveCadWork: async () => undefined, nextSequence: async () => 1, findAorNodeCode: async () => 'A1',
    findDepartmentById: async () => null, findRequesterDepartmentMembership: async () => null,
    findDepartmentTitlePriority: async () => null, isEmailWhitelisted: async () => false,
    patchTicket: async () => undefined, list: async () => ({ data: [], total: 0, limit: 20, offset: 0 }),
    findUserCompanyInfo: async () => ({ companyId: current.companyId, companyType: 'GC' }),
    findUserEmail: async () => 'requester@example.com', findPartyChiefForInstrumentMan: async () => null,
    findAorNodeIdsForUser: async () => [], findProjectStatus: async () => 'ACTIVE',
  };
}

function visibility(): VisibilityScope {
  return { actorId: requesterId, actorRole: 'REQUESTER', companyId: 'company-1' as UUID, companyType: 'GC' };
}

test('multipart route stores actual bytes and never accepts a caller storage key', async () => {
  const saved: Attachment[] = [];
  const writes: Uint8Array[] = [];
  const form = new FormData();
  form.set('file', new File([new TextEncoder().encode('test pdf bytes')], 'layout.pdf', { type: 'application/pdf' }));
  form.set('purpose', 'REQUEST_INSTRUCTION');
  form.set('storageKey', 'caller-controlled');
  const request = new NextRequest(`http://localhost/api/tickets/${ticketId}/attachments`, { method: 'POST', body: form });
  const deps: TicketAttachmentsRouteDeps = {
    getTicketRouteContext: async () => ({ tenantId, projectId, ticketId, actorId: requesterId, actorRole: 'REQUESTER', visibility: visibility() }),
    createTicketRepo: () => ticketRepo(ticket()),
    createAttachmentRepo: () => attachmentRepo(saved),
    createStorage: () => ({
      write: async (_tenant, _ticket, bytes) => { writes.push(bytes); return { storageKey: `${tenantId}/${ticketId}/server-key`, contentSha256: sha }; },
      read: async () => Buffer.alloc(0), remove: async () => undefined,
    }),
    validateAttachmentMetadata: () => undefined,
    withTransaction: async (fn) => fn(db()),
  };
  const response = await handlePostTicketAttachments(request, { params: Promise.resolve({ ticketId }) }, deps);
  assert.equal(response.status, 201);
  assert.equal(writes.length, 1);
  assert.equal(saved[0]?.storageKey, `${tenantId}/${ticketId}/server-key`);
  const json = await response.json() as { attachment: Record<string, unknown> };
  assert.equal('storageKey' in json.attachment, false);
});
