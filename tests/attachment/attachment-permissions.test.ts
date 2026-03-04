import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  ConflictError,
  ForbiddenError,
} from '@/shared/errors';
import {
  uploadAttachment,
  type IAttachmentRepository,
} from '@/modules/attachment/application';
import type { Attachment } from '@/modules/attachment/domain/types';
import {
  handlePostTicketAttachments,
  type TicketAttachmentsRouteDeps,
} from '@/app/api/tickets/[ticketId]/attachments/route';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

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
    status: 'IN_PROGRESS',
    craft: 'Civil',
    description: 'Attachment test ticket',
    requestedDate: new Date('2026-03-05T12:00:00Z'),
    submittedAt: now,
    approvedAt: now,
    assignedAt: now,
    startedAt: now,
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

function makeDb(onQuery?: (sql: string, params?: unknown[]) => void): DbClient {
  return {
    query: async (sql: string, params?: unknown[]) => {
      onQuery?.(sql, params);
      return { rows: [] };
    },
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/tickets/${ticketId}/attachments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function makeVisibility(): VisibilityScope {
  return {
    actorId,
    actorRole: 'REQUESTER',
    companyId: 'company-1' as UUID,
    companyType: 'GC',
  };
}

function makeRouteDeps(
  ticketRepo: ITicketRepository,
  attachmentRepo: IAttachmentRepository,
  db: DbClient,
  overrides?: Partial<TicketAttachmentsRouteDeps>,
): TicketAttachmentsRouteDeps {
  return {
    getTicketRouteContext: async () => ({
      tenantId,
      ticketId,
      actorId,
      actorRole: 'REQUESTER',
      projectId,
      visibility: makeVisibility(),
    }),
    createTicketRepo: () => ticketRepo,
    createAttachmentRepo: () => attachmentRepo,
    validateAttachmentMetadata: () => undefined,
    withTransaction: async (fn) => fn(db),
    ...overrides,
  };
}

test('uploadAttachment saves metadata and emits attachment.uploaded with ticket status', async () => {
  const saved: Attachment[] = [];
  const auditPayloads: Record<string, unknown>[] = [];
  const db = makeDb((sql, params) => {
    if (/INSERT INTO ticket_events/.test(sql)) {
      auditPayloads.push(JSON.parse(String(params?.[5])));
    }
  });
  const repo: IAttachmentRepository = {
    saveAttachment: async (_db, attachment) => {
      saved.push(attachment);
    },
  };

  const attachment = await uploadAttachment(repo, db, {
    tenantId,
    ticketId,
    ticketRequesterId: actorId,
    ticketStatus: 'IN_PROGRESS',
    projectStatus: 'ACTIVE',
    actorId,
    actorRole: 'REQUESTER',
    metadata: {
      filename: '  field-photo.jpg  ',
      mimeType: ' image/jpeg ',
      storageKey: ' attachments/ticket-1/photo.jpg ',
      sizeBytes: 2048,
    },
  });

  assert.equal(saved.length, 1);
  assert.equal(attachment.filename, 'field-photo.jpg');
  assert.equal(attachment.mimeType, 'image/jpeg');
  assert.equal(attachment.storageKey, 'attachments/ticket-1/photo.jpg');
  assert.equal(auditPayloads.length, 1);
  assert.equal(auditPayloads[0]?.ticketStatusAtUpload, 'IN_PROGRESS');
  assert.equal(auditPayloads[0]?.filename, 'field-photo.jpg');
});

test('uploadAttachment rejects non-requester actors', async () => {
  const repo: IAttachmentRepository = {
    saveAttachment: async () => undefined,
  };

  await assert.rejects(
    () => uploadAttachment(repo, makeDb(), {
      tenantId,
      ticketId,
      ticketRequesterId: actorId,
      ticketStatus: 'ASSIGNED',
      projectStatus: 'ACTIVE',
      actorId,
      actorRole: 'SURVEY_MANAGER',
      metadata: {
        filename: 'field-photo.jpg',
        mimeType: 'image/jpeg',
        storageKey: 'attachments/ticket-1/photo.jpg',
        sizeBytes: 2048,
      },
    }),
    ForbiddenError,
  );
});

test('uploadAttachment rejects requester uploads to someone else ticket', async () => {
  const repo: IAttachmentRepository = {
    saveAttachment: async () => undefined,
  };

  await assert.rejects(
    () => uploadAttachment(repo, makeDb(), {
      tenantId,
      ticketId,
      ticketRequesterId: 'other-requester' as UUID,
      ticketStatus: 'ASSIGNED',
      projectStatus: 'ACTIVE',
      actorId,
      actorRole: 'REQUESTER',
      metadata: {
        filename: 'field-photo.jpg',
        mimeType: 'image/jpeg',
        storageKey: 'attachments/ticket-1/photo.jpg',
        sizeBytes: 2048,
      },
    }),
    ForbiddenError,
  );
});

test('uploadAttachment rejects completed and canceled tickets', async () => {
  const repo: IAttachmentRepository = {
    saveAttachment: async () => undefined,
  };

  for (const status of ['COMPLETED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED'] as const) {
    await assert.rejects(
      () => uploadAttachment(repo, makeDb(), {
        tenantId,
        ticketId,
        ticketRequesterId: actorId,
        ticketStatus: status,
        projectStatus: 'ACTIVE',
        actorId,
        actorRole: 'REQUESTER',
        metadata: {
          filename: 'field-photo.jpg',
          mimeType: 'image/jpeg',
          storageKey: 'attachments/ticket-1/photo.jpg',
          sizeBytes: 2048,
        },
      }),
      ConflictError,
    );
  }
});

test('uploadAttachment rejects archived projects', async () => {
  const repo: IAttachmentRepository = {
    saveAttachment: async () => undefined,
  };

  await assert.rejects(
    () => uploadAttachment(repo, makeDb(), {
      tenantId,
      ticketId,
      ticketRequesterId: actorId,
      ticketStatus: 'ASSIGNED',
      projectStatus: 'ARCHIVED',
      actorId,
      actorRole: 'REQUESTER',
      metadata: {
        filename: 'field-photo.jpg',
        mimeType: 'image/jpeg',
        storageKey: 'attachments/ticket-1/photo.jpg',
        sizeBytes: 2048,
      },
    }),
    ConflictError,
  );
});

test('handlePostTicketAttachments returns 201 for requester uploads on active tickets', async () => {
  const saved: Attachment[] = [];
  const db = makeDb();
  const ticketRepo = makeTicketRepo({
    findById: async () => makeTicket({ status: 'ASSIGNED' }),
  });
  const attachmentRepo: IAttachmentRepository = {
    saveAttachment: async (_db, attachment) => {
      saved.push(attachment);
    },
  };

  const response = await handlePostTicketAttachments(
    makeRequest({
      filename: 'field-photo.jpg',
      mimeType: 'image/jpeg',
      storageKey: 'attachments/ticket-1/photo.jpg',
      sizeBytes: 2048,
    }),
    { params: Promise.resolve({ ticketId }) },
    makeRouteDeps(ticketRepo, attachmentRepo, db),
  );

  assert.equal(response.status, 201);
  const json = await response.json() as { attachment: Attachment };
  assert.equal(json.attachment.filename, 'field-photo.jpg');
  assert.equal(saved.length, 1);
});

test('handlePostTicketAttachments returns 400 when metadata is missing', async () => {
  const response = await handlePostTicketAttachments(
    makeRequest({
      filename: 'field-photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    }),
    { params: Promise.resolve({ ticketId }) },
    makeRouteDeps(
      makeTicketRepo(),
      { saveAttachment: async () => undefined },
      makeDb(),
    ),
  );

  assert.equal(response.status, 400);
});

test('handlePostTicketAttachments returns 404 when the ticket is not visible', async () => {
  const response = await handlePostTicketAttachments(
    makeRequest({
      filename: 'field-photo.jpg',
      mimeType: 'image/jpeg',
      storageKey: 'attachments/ticket-1/photo.jpg',
      sizeBytes: 2048,
    }),
    { params: Promise.resolve({ ticketId }) },
    makeRouteDeps(
      makeTicketRepo({
        findById: async () => null,
      }),
      { saveAttachment: async () => undefined },
      makeDb(),
    ),
  );

  assert.equal(response.status, 404);
});

test('handlePostTicketAttachments returns 403 for non-requester actors', async () => {
  const response = await handlePostTicketAttachments(
    makeRequest({
      filename: 'field-photo.jpg',
      mimeType: 'image/jpeg',
      storageKey: 'attachments/ticket-1/photo.jpg',
      sizeBytes: 2048,
    }),
    { params: Promise.resolve({ ticketId }) },
    makeRouteDeps(
      makeTicketRepo(),
      { saveAttachment: async () => undefined },
      makeDb(),
      {
        getTicketRouteContext: async () => ({
          tenantId,
          ticketId,
          actorId: 'manager-1' as UUID,
          actorRole: 'SURVEY_MANAGER',
          projectId,
          visibility: {
            actorId: 'manager-1' as UUID,
            actorRole: 'SURVEY_MANAGER',
            companyId: 'company-1' as UUID,
            companyType: 'GC',
          },
        }),
      },
    ),
  );

  assert.equal(response.status, 403);
});

test('handlePostTicketAttachments returns 409 for archived projects', async () => {
  const response = await handlePostTicketAttachments(
    makeRequest({
      filename: 'field-photo.jpg',
      mimeType: 'image/jpeg',
      storageKey: 'attachments/ticket-1/photo.jpg',
      sizeBytes: 2048,
    }),
    { params: Promise.resolve({ ticketId }) },
    makeRouteDeps(
      makeTicketRepo({
        findProjectStatus: async () => 'ARCHIVED',
      }),
      { saveAttachment: async () => undefined },
      makeDb(),
    ),
  );

  assert.equal(response.status, 409);
});
