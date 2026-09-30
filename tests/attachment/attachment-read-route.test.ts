import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  handleGetTicketAttachments,
  handlePostTicketAttachments,
  type TicketAttachmentsRouteDeps,
  handleDownloadTicketAttachment,
  type TicketAttachmentDownloadDeps,
  type TicketAttachmentsGetRouteDeps,
} from '@/app/api/tickets/[ticketId]/attachments/handler';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { UUID } from '@/shared/types';
import { validateAttachmentObjectMetadata } from '@/modules/attachment/infrastructure';
import type { Attachment } from '@/modules/attachment/domain/types';

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

function makeUploadHarness(options: {
  ticket?: Ticket | null;
  auditFailure?: boolean;
  limit?: number;
} = {}) {
  const calls = { writes: 0, removed: [] as string[], saved: [] as Attachment[], audits: 0, committed: false, failed: false };
  const key = 'server-generated-storage-key';
  const deps: TicketAttachmentsRouteDeps = {
    getTicketRouteContext: makeDeps().getTicketRouteContext,
    createTicketRepo: () => makeTicketRepo({
      findById: async (_db, tenant, id, visibility) => {
        assert.equal(tenant, tenantId);
        assert.equal(id, ticketId);
        assert.equal(visibility?.actorId, actorId);
        return options.ticket === undefined ? makeTicket({ status: 'RETURNED_FOR_CORRECTION', returnCycle: 2 }) : options.ticket;
      },
    }),
    createAttachmentRepo: () => ({
      saveAttachment: async (_db, attachment) => { calls.saved.push(attachment); },
      findProjectAttachmentLimit: async () => options.limit ?? null,
      countTicketAttachments: async () => 1,
    }),
    createStorage: () => ({
      write: async (tenant, id, bytes) => {
        assert.equal(tenant, tenantId);
        assert.equal(id, ticketId);
        assert.equal(Buffer.from(bytes).toString(), 'instruction bytes');
        calls.writes++;
        return { storageKey: key, contentSha256: 'a'.repeat(64) };
      },
      read: async () => { throw new Error('Upload must not read storage'); },
      remove: async (storageKey) => { calls.removed.push(storageKey); },
    }),
    validateAttachmentMetadata: validateAttachmentObjectMetadata,
    withTransaction: async (fn) => {
      try {
        const result = await fn({ query: async (sql, params) => {
          assert.match(sql, /INSERT INTO ticket_events/);
          assert.deepEqual(params?.slice(1, 5), [ticketId, tenantId, actorId, 'attachment.uploaded']);
          const payload = JSON.parse(String(params?.[5])) as { attachmentId: string; returnCycle: number };
          assert.equal(payload.attachmentId, calls.saved[0]?.id);
          assert.equal(payload.returnCycle, calls.saved[0]?.returnCycle);
          calls.audits++;
          if (options.auditFailure) throw new Error('Injected audit failure');
          return { rows: [] };
        } });
        calls.committed = true;
        return result;
      } catch (error) {
        calls.failed = true;
        throw error;
      }
    },
  };
  return { deps, calls, key };
}

function makeUploadRequest(purpose = 'REQUEST_INSTRUCTION', filename = 'instructions.txt', bytes = 'instruction bytes') {
  const form = new FormData();
  form.set('file', new File([bytes], filename, { type: 'text/plain' }));
  form.set('purpose', purpose);
  // These client fields must not override the server-captured revision or storage key.
  form.set('returnCycle', '999');
  form.set('storageKey', 'client-selected-key');
  return new NextRequest(`http://localhost/api/tickets/${ticketId}/attachments`, { method: 'POST', body: form });
}

test('attachment upload handler retains bytes only after success and binds the server revision', async () => {
  const { deps, calls, key } = makeUploadHarness();
  const response = await handlePostTicketAttachments(makeUploadRequest(), { params: Promise.resolve({ ticketId }) }, deps);
  assert.equal(response.status, 201);
  const body = await response.json() as { attachment: Omit<Attachment, 'storageKey'> & { storageKey?: string; downloadUrl: string } };
  assert.equal(body.attachment.returnCycle, 2);
  assert.equal(body.attachment.storageKey, undefined);
  assert.equal(body.attachment.uploadedBy, actorId);
  assert.equal(body.attachment.tenantId, tenantId);
  assert.equal(body.attachment.downloadUrl, `/api/tickets/${ticketId}/attachments/${body.attachment.id}`);
  assert.equal(calls.saved[0]?.storageKey, key);
  assert.equal(calls.saved.length, 1);
  assert.equal(calls.audits, 1);
  assert.equal(calls.committed, true);
  assert.deepEqual(calls.removed, []);
});

for (const scenario of [
  { name: 'invisible ticket', options: { ticket: null }, status: 404 },
  { name: 'another requester', options: { ticket: makeTicket({ status: 'RETURNED_FOR_CORRECTION', requesterId: 'other-requester' as UUID }) }, status: 403 },
  { name: 'sealed completed instructions', options: { ticket: makeTicket({ status: 'COMPLETED' }) }, status: 409 },
  { name: 'attachment count cap', options: { limit: 1 }, status: 409 },
  { name: 'audit persistence failure', options: { auditFailure: true }, status: 500 },
]) {
  test(`attachment upload handler removes staged bytes on ${scenario.name}`, async () => {
    const { deps, calls, key } = makeUploadHarness(scenario.options);
    const response = await handlePostTicketAttachments(makeUploadRequest(), { params: Promise.resolve({ ticketId }) }, deps);
    assert.equal(response.status, scenario.status);
    assert.equal(calls.writes, 1);
    assert.deepEqual(calls.removed, [key]);
    assert.equal(calls.committed, false);
    assert.equal(calls.failed, true);
    assert.equal(calls.saved.length, scenario.options.auditFailure ? 1 : 0);
    assert.equal(calls.audits, scenario.options.auditFailure ? 1 : 0);
  });
}

test('attachment upload handler rejects invalid multipart input before writing bytes', async () => {
  for (const request of [makeUploadRequest('UNRECOGNIZED'), makeUploadRequest('REQUEST_INSTRUCTION', 'empty.txt', '')]) {
    const { deps, calls } = makeUploadHarness();
    const response = await handlePostTicketAttachments(request, { params: Promise.resolve({ ticketId }) }, deps);
    assert.equal(response.status, 400);
    assert.equal(calls.writes, 0);
    assert.equal(calls.saved.length, 0);
    assert.deepEqual(calls.removed, []);
  }
});

test('attachment upload handler rejects file type before staging bytes', async () => {
  const { deps, calls } = makeUploadHarness();
  const response = await handlePostTicketAttachments(makeUploadRequest('REQUEST_INSTRUCTION', 'script.html'), { params: Promise.resolve({ ticketId }) }, deps);
  assert.equal(response.status, 400);
  assert.equal(calls.writes, 0);
  assert.deepEqual(calls.removed, []);
  assert.equal(calls.saved.length, 0);
  assert.equal(calls.audits, 0);
});

test('attachment upload handler refuses an over-limit request before multipart parsing or storage', async () => {
  const { deps, calls } = makeUploadHarness();
  const request = makeUploadRequest();
  request.headers.set('content-length', String(32 * 1024 * 1024));
  const response = await handlePostTicketAttachments(
    request, { params: Promise.resolve({ ticketId }) }, deps,
  );
  assert.equal(response.status, 400);
  assert.equal(calls.writes, 0);
  assert.deepEqual(calls.removed, []);
});
