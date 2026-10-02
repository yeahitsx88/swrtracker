import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTicketMutation } from '@/lib/ticket-route-helpers';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { pool } from '@/lib/db';
import { assertUploadAuthority, uploadAttachment } from '@/modules/attachment/application';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import type { AttachmentMetadataValidator, IAttachmentRepository } from '@/modules/attachment/application';
import { AttachmentRepository, LocalAttachmentStorage, MAX_ATTACHMENT_BYTES, validateAttachmentObjectMetadata, validateAttachmentUploadCandidate } from '@/modules/attachment/infrastructure';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { DbClient, UUID } from '@/shared/types';
import type { AttachmentPurpose } from '@/modules/attachment/domain/types';

interface AttachmentStorage {
  write(tenantId: UUID, ticketId: UUID, bytes: Uint8Array): Promise<{ storageKey: string; contentSha256: string }>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}

export interface TicketAttachmentsRouteDeps {
  getTicketRouteContext: typeof getTicketRouteContext;
  createTicketRepo: () => ITicketRepository;
  createAttachmentRepo: () => IAttachmentRepository;
  createStorage: () => AttachmentStorage;
  validateAttachmentMetadata: AttachmentMetadataValidator;
  withTicketMutation: typeof withTicketMutation;
}

const defaultDeps: TicketAttachmentsRouteDeps = {
  getTicketRouteContext,
  createTicketRepo: () => new TicketRepository(),
  createAttachmentRepo: () => new AttachmentRepository(),
  createStorage: () => new LocalAttachmentStorage(),
  validateAttachmentMetadata: validateAttachmentObjectMetadata,
  withTicketMutation,
};

function attachmentResponse(row: AttachmentRow) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    tenantId: row.tenant_id,
    uploadedBy: row.uploaded_by,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    purpose: row.purpose,
    returnCycle: row.return_cycle,
    contentSha256: row.content_sha256,
    createdAt: new Date(row.created_at).toISOString(),
    downloadUrl: `/api/tickets/${row.ticket_id}/attachments/${row.id}`,
  };
}

function parsePurpose(value: FormDataEntryValue | null): AttachmentPurpose {
  if (value === 'REQUEST_INSTRUCTION' || value === 'FIELD_SUPPORT') return value;
  throw new ValidationError('purpose must be REQUEST_INSTRUCTION or FIELD_SUPPORT');
}

// Multipart parsers buffer the entire request. Bound the stream before invoking one,
// including when Content-Length is absent or dishonest.
const MAX_MULTIPART_BYTES = MAX_ATTACHMENT_BYTES + 1024 * 1024;

async function boundedMultipartForm(req: NextRequest): Promise<FormData> {
  const contentType = req.headers.get('content-type');
  if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) {
    throw new ValidationError('multipart/form-data is required');
  }
  const declaredLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    throw new ValidationError('Attachment request exceeds the upload limit');
  }
  if (!req.body) throw new ValidationError('file is required');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new ValidationError('Attachment request exceeds the upload limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, { headers: { 'content-type': contentType } }).formData();
}

export async function handlePostTicketAttachments(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
  deps: TicketAttachmentsRouteDeps = defaultDeps,
) {
  let storedKey: string | null = null;
  let storage: AttachmentStorage | null = null;
  try {
    const { ticketId } = await params;
    const ctx = await deps.getTicketRouteContext(req, ticketId);
    const retryKey = req.headers.has('idempotency-key') ? requireIdempotencyKey(req) : null;
    const form = await boundedMultipartForm(req);
    const file = form.get('file');
    if (!(file instanceof File) || file.size <= 0) throw new ValidationError('file is required');
    const purpose = parsePurpose(form.get('purpose'));
    validateAttachmentUploadCandidate(file.name, file.type || 'application/octet-stream', file.size);
    const bytes = new Uint8Array(await file.arrayBuffer());
    storage = deps.createStorage();
    const stored = await storage.write(ctx.tenantId, ctx.ticketId, bytes);
    storedKey = stored.storageKey;

    const ticketRepo = deps.createTicketRepo();
    const attachmentRepo = deps.createAttachmentRepo();
    const result = await deps.withTicketMutation(req, ctx, async (db, ctx) => {
      // Serialize upload, submit and delete, including attachment-limit checks.
      await db.query(`SELECT id FROM tickets WHERE tenant_id = $1 AND project_id = $2 AND id = $3 FOR UPDATE`,
        [ctx.tenantId, ctx.projectId, ctx.ticketId]);
      const ticket = await ticketRepo.findById(db, ctx.tenantId, ctx.ticketId, ctx.visibility);
      if (!ticket) throw new NotFoundError(`Ticket ${ctx.ticketId} not found`);
      const projectStatus = await ticketRepo.findProjectStatus(db, ctx.tenantId, ctx.projectId);
      if (!projectStatus) throw new NotFoundError('Project not found');
      if (projectStatus === 'ARCHIVED') throw new ConflictError('Archived projects are read-only');
      assertUploadAuthority({ ticketRequesterId: ticket.requesterId, ticketStatus: ticket.status,
        actorId: ctx.actorId, actorRole: ctx.actorRole, assignedPartyChiefId: ticket.assignedPartyChiefId,
        assignedInstrumentManId: ticket.assignedInstrumentManId, purpose });
      const mutate = async () => {
        const attachment = await uploadAttachment(attachmentRepo, db, {
        tenantId: ctx.tenantId,
        projectId: ctx.projectId,
        ticketId: ctx.ticketId,
        ticketRequesterId: ticket.requesterId,
        ticketStatus: ticket.status,
        ticketReturnCycle: ticket.returnCycle ?? 0,
        assignedPartyChiefId: ticket.assignedPartyChiefId,
        assignedInstrumentManId: ticket.assignedInstrumentManId,
        projectStatus,
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
        metadata: {
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          storageKey: stored.storageKey,
          sizeBytes: file.size,
          purpose,
          returnCycle: ticket.returnCycle ?? 0,
          contentSha256: stored.contentSha256,
        },
        validateMetadata: deps.validateAttachmentMetadata,
        });
        return { status: 201, body: { attachment: { ...attachment, storageKey: undefined,
          createdAt: attachment.createdAt.toISOString(),
          downloadUrl: `/api/tickets/${attachment.ticketId}/attachments/${attachment.id}` } } };
      };
      if (!retryKey) return { ...await mutate(), replayed: false };
      return executeIdempotentHttpMutation(db, {
        tenantId: ctx.tenantId, actorId: ctx.actorId,
        endpoint: `POST /api/tickets/${ctx.ticketId}/attachments`, idempotencyKey: retryKey,
      }, { filename: file.name, mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size, purpose, contentSha256: stored.contentSha256 }, mutate);
    });
    if (result.replayed) await storage.remove(stored.storageKey);
    storedKey = null;
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    if (storedKey && storage) await storage.remove(storedKey);
    return errorResponse(err);
  }
}

interface AttachmentRow {
  id: string;
  ticket_id: string;
  tenant_id: string;
  uploaded_by: string;
  filename: string;
  mime_type: string;
  storage_key: string;
  size_bytes: number;
  purpose: AttachmentPurpose;
  return_cycle: number;
  content_sha256: string;
  created_at: Date | string;
}

export interface TicketAttachmentsGetRouteDeps {
  getTicketRouteContext: typeof getTicketRouteContext;
  createTicketRepo: () => ITicketRepository;
  listAttachments: (tenantId: string, ticketId: string) => Promise<AttachmentRow[]>;
}

const defaultGetDeps: TicketAttachmentsGetRouteDeps = {
  getTicketRouteContext,
  createTicketRepo: () => new TicketRepository(),
  listAttachments: async (tenantId, ticketId) => {
    const { rows } = await pool.query<AttachmentRow>(
      `SELECT id, ticket_id, tenant_id, uploaded_by, filename, mime_type, storage_key, size_bytes,
              purpose, return_cycle, content_sha256, created_at
       FROM attachments WHERE tenant_id = $1 AND ticket_id = $2
       ORDER BY return_cycle, created_at, id`,
      [tenantId, ticketId],
    );
    return rows;
  },
};

async function findVisibleTicket(req: NextRequest, ticketId: string, deps: Pick<TicketAttachmentsGetRouteDeps, 'getTicketRouteContext' | 'createTicketRepo'>) {
  const ctx = await deps.getTicketRouteContext(req, ticketId);
  const ticket = await deps.createTicketRepo().findById(pool, ctx.tenantId, ctx.ticketId, ctx.visibility);
  if (!ticket) throw new NotFoundError(`Ticket ${ctx.ticketId} not found`);
  return ctx;
}

export async function handleGetTicketAttachments(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
  deps: TicketAttachmentsGetRouteDeps = defaultGetDeps,
) {
  try {
    const { ticketId } = await params;
    const ctx = await findVisibleTicket(req, ticketId, deps);
    const rows = await deps.listAttachments(ctx.tenantId, ctx.ticketId);
    return NextResponse.json({ attachments: rows.map(attachmentResponse) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handleDownloadTicketAttachment(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string; attachmentId: string }> },
  deps: TicketAttachmentDownloadDeps = defaultDownloadDeps,
) {
  try {
    const { ticketId, attachmentId } = await params;
    const expected = await deps.getTicketRouteContext(req, ticketId);
    requireResourceUuid(attachmentId, 'attachmentId');
    return await deps.withTicketMutation(req, expected, async (db, ctx) => {
      const ticket = await deps.createTicketRepo().findById(db, ctx.tenantId, ctx.ticketId, ctx.visibility);
      if (!ticket) throw new NotFoundError('Ticket not found');
      const attachment = await deps.findAttachment(ctx.tenantId, ctx.ticketId, attachmentId, db);
      if (!attachment) throw new NotFoundError('Attachment not found');
      const bytes = await deps.createStorage().read(attachment.storage_key);
      // Build a valid response before persisting a successful download audit.
      const normalizedFilename=Buffer.from(attachment.filename,'utf8').toString('utf8');
      const fallback=normalizedFilename.replace(/[^\x20-\x7e]|["\\]/g,'_');
      const encoded=encodeURIComponent(normalizedFilename).replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
      const response=new NextResponse(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'Content-Type': attachment.mime_type,
          'Content-Length': String(bytes.byteLength),
          'Content-Disposition': 'attachment; filename="'+fallback+'"; filename*=UTF-8\'\''+encoded,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
        },
      });
      await appendAuditEvent(db, {
        ticketId: ctx.ticketId,
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        eventType: 'attachment.downloaded',
        payload: { attachmentId, filename: attachment.filename, contentSha256: attachment.content_sha256 },
      });
      return response;
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export interface TicketAttachmentDownloadDeps {
  getTicketRouteContext: typeof getTicketRouteContext;
  createTicketRepo: () => ITicketRepository;
  findAttachment: (tenantId: string, ticketId: string, attachmentId: string, db: DbClient) => Promise<AttachmentRow | null>;
  createStorage: () => Pick<AttachmentStorage, 'read'>;
  withTicketMutation: typeof withTicketMutation;
}

const defaultDownloadDeps: TicketAttachmentDownloadDeps = {
  getTicketRouteContext,
  createTicketRepo: () => new TicketRepository(),
  findAttachment: async (tenantId, ticketId, attachmentId, db) => {
    const { rows } = await db.query<AttachmentRow>(
      `SELECT id, ticket_id, tenant_id, uploaded_by, filename, mime_type, storage_key, size_bytes,
              purpose, return_cycle, content_sha256, created_at
       FROM attachments WHERE tenant_id = $1 AND ticket_id = $2 AND id = $3 LIMIT 1`,
      [tenantId, ticketId, attachmentId],
    );
    return rows[0] ?? null;
  },
  createStorage: () => new LocalAttachmentStorage(),
  withTicketMutation,
};
