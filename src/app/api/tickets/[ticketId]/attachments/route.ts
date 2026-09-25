/**
 * POST raw bytes with percent-encoded x-file-name-utf8 (or legacy x-file-name)
 * and Content-Type headers (max 20 MiB).
 * GET lists attachment metadata for a visible ticket.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTicketReadContext } from '@/lib/ticket-route-helpers';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { MAX_ATTACHMENT_BYTES, listTicketAttachments, recordAttachmentUpload,
  validateAttachmentMetadata,
  requireWritableTicket, canUploadAttachment } from '@/modules/attachment/application';
import { attachmentFilename } from './filename-header';
import { AttachmentRepository, VolumeAttachmentStorage } from
  '@/modules/attachment/infrastructure';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function publicAttachment(attachment: {
  id: string; ticketId: string; tenantId: string; uploadedBy: string;
  filename: string; mimeType: string; sizeBytes: number;
  ticketStatusAtUpload: string; createdAt: Date;
}) {
  return { id: attachment.id, ticketId: attachment.ticketId,
    uploadedBy: attachment.uploadedBy, filename: attachment.filename,
    mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes,
    ticketStatusAtUpload: attachment.ticketStatusAtUpload,
    createdAt: attachment.createdAt };
}

export async function POST(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const auth = await requireAuth(req);
    const ticketId = parseUuid((await params).ticketId, 'ticketId');
    const filename = attachmentFilename(req.headers);
    if (!req.body) throw new ValidationError('File body is required');
    const mimeType = (req.headers.get('content-type') ?? 'application/octet-stream')
      .split(';', 1)[0]?.trim() ?? 'application/octet-stream';
    const safeFilename = validateAttachmentMetadata(filename, mimeType);
    const declaredSize = req.headers.get('content-length');
    if (declaredSize !== null && (!/^\d+$/u.test(declaredSize) ||
        Number(declaredSize) < 1 || Number(declaredSize) > MAX_ATTACHMENT_BYTES)) {
      throw new ValidationError('Attachment must be 1-20 MiB');
    }
    const repo = new AttachmentRepository();
    await requireWritableTicket(repo, pool, auth.tenantId, ticketId, auth.userId);
    const storage = new VolumeAttachmentStorage();
    const storageKey = storage.createStorageKey(auth.tenantId, ticketId);
    const sizeBytes = await storage.write(storageKey, req.body, MAX_ATTACHMENT_BYTES);
    try {
      const attachment = await withTransaction(db => recordAttachmentUpload(repo, db, {
        tenantId: auth.tenantId, ticketId, actorId: auth.userId,
        filename: safeFilename, mimeType, storageKey, sizeBytes,
      }));
      return NextResponse.json({ attachment: publicAttachment(attachment) }, { status: 201 });
    } catch (error) {
      await storage.remove(storageKey);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const ticketId = (await params).ticketId;
    const ctx = await getTicketReadContext(req, ticketId);
    const ticket = await new TicketRepository().findById(
      pool, ctx.tenantId, ctx.ticketId, ctx.visibility);
    if (!ticket) throw new NotFoundError('Ticket not found');
    const { searchParams } = new URL(req.url);
    const page = await listTicketAttachments(new AttachmentRepository(), pool, {
      tenantId: ctx.tenantId, ticketId: ctx.ticketId,
      limit: Number(searchParams.get('limit') ?? '50'),
      offset: Number(searchParams.get('offset') ?? '0'),
    });
    const canUpload = await canUploadAttachment(new AttachmentRepository(), pool,
      ctx.tenantId, ctx.ticketId, ctx.visibility.actorId);
    return NextResponse.json({ ...page, data: page.data.map(publicAttachment),
      canUpload, maxUploadBytes: MAX_ATTACHMENT_BYTES });
  } catch (error) {
    return errorResponse(error);
  }
}
