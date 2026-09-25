import { NextResponse, type NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { pool } from '@/lib/db';
import { uploadAttachment } from '@/modules/attachment/application';
import type { AttachmentMetadataValidator, IAttachmentRepository } from '@/modules/attachment/application';
import { AttachmentRepository, LocalAttachmentStorage, validateAttachmentObjectMetadata } from '@/modules/attachment/infrastructure';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { DbClient, UUID } from '@/shared/types';
import type { AttachmentPurpose } from '@/modules/attachment/domain/types';

type TransactionRunner = <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;

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
  withTransaction: TransactionRunner;
}

const defaultDeps: TicketAttachmentsRouteDeps = {
  getTicketRouteContext,
  createTicketRepo: () => new TicketRepository(),
  createAttachmentRepo: () => new AttachmentRepository(),
  createStorage: () => new LocalAttachmentStorage(),
  validateAttachmentMetadata: validateAttachmentObjectMetadata,
  withTransaction,
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
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size <= 0) throw new ValidationError('file is required');
    const purpose = parsePurpose(form.get('purpose'));
    const bytes = new Uint8Array(await file.arrayBuffer());
    storage = deps.createStorage();
    const stored = await storage.write(ctx.tenantId, ctx.ticketId, bytes);
    storedKey = stored.storageKey;

    const ticketRepo = deps.createTicketRepo();
    const attachmentRepo = deps.createAttachmentRepo();
    const attachment = await deps.withTransaction(async (db) => {
      const ticket = await ticketRepo.findById(db, ctx.tenantId, ctx.ticketId, ctx.visibility);
      if (!ticket) throw new NotFoundError(`Ticket ${ctx.ticketId} not found`);
      const projectStatus = await ticketRepo.findProjectStatus(db, ctx.tenantId, ctx.projectId);
      if (!projectStatus) throw new NotFoundError('Project not found');
      return uploadAttachment(attachmentRepo, db, {
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
    });
    storedKey = null;
    return NextResponse.json({
      attachment: {
        ...attachment,
        storageKey: undefined,
        createdAt: attachment.createdAt.toISOString(),
        downloadUrl: `/api/tickets/${attachment.ticketId}/attachments/${attachment.id}`,
      },
    }, { status: 201 });
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
    const ctx = await findVisibleTicket(req, ticketId, deps);
    const attachment = await deps.findAttachment(ctx.tenantId, ctx.ticketId, attachmentId);
    if (!attachment) throw new NotFoundError('Attachment not found');
    const bytes = await deps.createStorage().read(attachment.storage_key);
    await deps.withTransaction((db) => appendAuditEvent(db, {
      ticketId: ctx.ticketId,
      tenantId: ctx.tenantId,
      actorId: ctx.actorId,
      eventType: 'attachment.downloaded',
      payload: { attachmentId, filename: attachment.filename, contentSha256: attachment.content_sha256 },
    }));
    const safeFilename = attachment.filename.replace(/[\r\n"\\]/g, '_');
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': attachment.mime_type,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export interface TicketAttachmentDownloadDeps {
  getTicketRouteContext: typeof getTicketRouteContext;
  createTicketRepo: () => ITicketRepository;
  findAttachment: (tenantId: string, ticketId: string, attachmentId: string) => Promise<AttachmentRow | null>;
  createStorage: () => Pick<AttachmentStorage, 'read'>;
  withTransaction: TransactionRunner;
}

const defaultDownloadDeps: TicketAttachmentDownloadDeps = {
  getTicketRouteContext,
  createTicketRepo: () => new TicketRepository(),
  findAttachment: async (tenantId, ticketId, attachmentId) => {
    const { rows } = await pool.query<AttachmentRow>(
      `SELECT id, ticket_id, tenant_id, uploaded_by, filename, mime_type, storage_key, size_bytes,
              purpose, return_cycle, content_sha256, created_at
       FROM attachments WHERE tenant_id = $1 AND ticket_id = $2 AND id = $3 LIMIT 1`,
      [tenantId, ticketId, attachmentId],
    );
    return rows[0] ?? null;
  },
  createStorage: () => new LocalAttachmentStorage(),
  withTransaction,
};
