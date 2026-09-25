import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  handleGetTicketAttachments,
  handleDownloadTicketAttachment,
  type TicketAttachmentDownloadDeps,
  type TicketAttachmentsGetRouteDeps,
} from '@/app/api/tickets/[ticketId]/attachments/handler';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { UUID } from '@/shared/types';

const tenantId = 'tenant-1' as UUID;
const projectId = 'project-1' as UUID;
const ticketId = 'ticket-1' as UUID;
const actorId = 'requester-1' as UUID;

function makeTicket(overrides?: Partial<Ticket>): Ticket {
  const now = new Date('2026-03-04T12:00:00Z');

  return {
    id: ticketId,
    tenantId,
    projectId,
    aorNodeId: 'aor-node-1' as UUID,
    departmentId: null,
    companyId: 'company-1' as UUID,
    ticketNumber: 'U1-0001',
    ticketType: 'LAYOUT',
    requesterId: actorId,
    assignedPartyChiefId: null,
    assignedInstrumentManId: null,
    surveyLeadId: null,
    workflowVariant: 'STANDARD_APPROVAL',
    status: 'ASSIGNED',
    craft: 'Civil',
    description: 'Attachment list test ticket',
    requestedDate: new Date('2026-03-05T12:00:00Z'),
    submittedAt: now,
    approvedAt: now,
    assignedAt: now,
    startedAt: null,
    pendingPcOutcome: null,
    pendingPcReason: null,
    surveyCancelRequestedBy: null,
    surveyCancelRequestedRole: null,
    surveyCancelReason: null,
    surveyCancelRequestedAt: null,
    completedAt: null,
    closedAt: null,
    rejectionReason: null,
    parentTicketId: null,
    priority: 'NORMAL',
    prioritySetBy: null,
    prioritySetReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeVisibility(): VisibilityScope {
  return {
    actorId,
    actorRole: 'REQUESTER',
    companyId: 'company-1' as UUID,
    companyType: 'GC',
  };
}

function makeTicketRepo(overrides?: Partial<ITicketRepository>): ITicketRepository {
  return {
    findById: async () => makeTicket(),
    findByIdInternal: async () => makeTicket(),
    save: async () => undefined,
    saveCadWork: async () => undefined,
    nextSequence: async () => 1,
    findAorNodeCode: async () => 'U1',
    findDepartmentById: async () => null,
    findRequesterDepartmentMembership: async () => null,
    findDepartmentTitlePriority: async () => null,
    isEmailWhitelisted: async () => false,
    patchTicket: async () => undefined,
    list: async () => ({ data: [], total: 0, limit: 50, offset: 0 }),
    findUserCompanyInfo: async () => ({
      companyId: 'company-1' as UUID,
      companyType: 'GC',
    }),
    findUserEmail: async () => 'requester@example.com',
    findPartyChiefForInstrumentMan: async () => null,
    findAorNodeIdsForUser: async () => [],
    findProjectStatus: async () => 'ACTIVE',
    ...overrides,
  };
}

function makeRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/tickets/${ticketId}/attachments`, {
    method: 'GET',
  });
}

function makeDeps(overrides?: Partial<TicketAttachmentsGetRouteDeps>): TicketAttachmentsGetRouteDeps {
  return {
    getTicketRouteContext: async () => ({
      tenantId,
      ticketId,
      actorId,
      actorRole: 'REQUESTER',
      projectId,
      visibility: makeVisibility(),
    }),
    createTicketRepo: () => makeTicketRepo(),
    listAttachments: async () => ([
      {
        id: 'attachment-2',
        ticket_id: ticketId,
        tenant_id: tenantId,
        uploaded_by: actorId,
        filename: 'photo-2.jpg',
        mime_type: 'image/jpeg',
        storage_key: 'attachments/ticket-1/photo-2.jpg',
        size_bytes: 1000,
        purpose: 'FIELD_SUPPORT',
        return_cycle: 1,
        content_sha256: 'a'.repeat(64),
        created_at: new Date('2026-03-04T12:05:00Z'),
      },
      {
        id: 'attachment-1',
        ticket_id: ticketId,
        tenant_id: tenantId,
        uploaded_by: actorId,
        filename: 'photo-1.jpg',
        mime_type: 'image/jpeg',
        storage_key: 'attachments/ticket-1/photo-1.jpg',
        size_bytes: 900,
        purpose: 'REQUEST_INSTRUCTION',
        return_cycle: 0,
        content_sha256: 'b'.repeat(64),
        created_at: new Date('2026-03-04T12:00:00Z'),
      },
    ]),
    ...overrides,
  };
}

test('handleGetTicketAttachments returns mapped attachment metadata', async () => {
  const response = await handleGetTicketAttachments(
    makeRequest(),
    { params: Promise.resolve({ ticketId }) },
    makeDeps(),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as {
    attachments: Array<{
      id: string;
      ticketId: string;
      tenantId: string;
      uploadedBy: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      createdAt: string;
      downloadUrl: string;
    }>;
  };

  assert.equal(json.attachments.length, 2);
  assert.equal(json.attachments[0]?.id, 'attachment-2');
  assert.equal(json.attachments[0]?.ticketId, ticketId);
  assert.equal(json.attachments[0]?.createdAt, '2026-03-04T12:05:00.000Z');
  assert.equal(json.attachments[0]?.downloadUrl, `/api/tickets/${ticketId}/attachments/attachment-2`);
  assert.equal('storageKey' in json.attachments[0]!, false);
});

test('handleGetTicketAttachments returns 404 when ticket is not visible', async () => {
  const response = await handleGetTicketAttachments(
    makeRequest(),
    { params: Promise.resolve({ ticketId }) },
    makeDeps({
      createTicketRepo: () =>
        makeTicketRepo({
          findById: async () => null,
        }),
    }),
  );

  assert.equal(response.status, 404);
});

test('handleGetTicketAttachments allows survey manager visibility for attachment metadata access', async () => {
  const managerId = 'manager-1' as UUID;
  const response = await handleGetTicketAttachments(
    makeRequest(),
    { params: Promise.resolve({ ticketId }) },
    makeDeps({
      getTicketRouteContext: async () => ({
        tenantId,
        ticketId,
        actorId: managerId,
        actorRole: 'SURVEY_MANAGER',
        projectId,
        visibility: {
          actorId: managerId,
          actorRole: 'SURVEY_MANAGER',
          companyId: 'company-1' as UUID,
          companyType: 'GC',
        },
      }),
    }),
  );

  assert.equal(response.status, 200);
  const json = await response.json() as { attachments: Array<{ id: string }> };
  assert.equal(json.attachments.length, 2);
});

test('attachment download checks ticket visibility, streams bytes, and records the download', async () => {
  const auditSql: string[] = [];
  const deps: TicketAttachmentDownloadDeps = {
    getTicketRouteContext: makeDeps().getTicketRouteContext,
    createTicketRepo: () => makeTicketRepo(),
    findAttachment: async () => ({
      id: 'attachment-1', ticket_id: ticketId, tenant_id: tenantId, uploaded_by: actorId,
      filename: 'layout.pdf', mime_type: 'application/pdf', storage_key: `${tenantId}/${ticketId}/file-1`,
      size_bytes: 9, purpose: 'REQUEST_INSTRUCTION', return_cycle: 0,
      content_sha256: 'a'.repeat(64), created_at: new Date('2026-03-04T12:00:00Z'),
    }),
    createStorage: () => ({ read: async () => Buffer.from('pdf bytes') }),
    withTransaction: async (fn) => fn({
      query: async (sql: string) => { auditSql.push(sql); return { rows: [] }; },
    }),
  };
  const response = await handleDownloadTicketAttachment(
    makeRequest(),
    { params: Promise.resolve({ ticketId, attachmentId: 'attachment-1' }) },
    deps,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.match(response.headers.get('content-disposition') ?? '', /layout\.pdf/);
  assert.equal(await response.text(), 'pdf bytes');
  assert.ok(auditSql.some((sql) => /ticket_events/.test(sql)));
});
