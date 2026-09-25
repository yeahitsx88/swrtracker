/** Download one attachment after ticket visibility and tenant checks. */
import { NextResponse, type NextRequest } from 'next/server';
import { NotFoundError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTicketReadContext } from '@/lib/ticket-route-helpers';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { findTicketAttachment, recordAttachmentDownload } from
  '@/modules/attachment/application';
import { AttachmentRepository, VolumeAttachmentStorage } from
  '@/modules/attachment/infrastructure';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string; attachmentId: string }> }) {
  try {
    const auth = await requireAuth(req);
    const { ticketId, attachmentId } = await params;
    const ctx = await getTicketReadContext(req, ticketId);
    const ticket = await new TicketRepository().findById(
      pool, ctx.tenantId, ctx.ticketId, ctx.visibility);
    if (!ticket) throw new NotFoundError('Ticket not found');
    const attachment = await findTicketAttachment(new AttachmentRepository(), pool,
      ctx.tenantId, ctx.ticketId, parseUuid(attachmentId, 'attachmentId'));
    const bytes = await new VolumeAttachmentStorage().read(attachment.storageKey);
    await withTransaction(db => recordAttachmentDownload(db, attachment, auth.userId));
    const safeName = attachment.filename.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_');
    const responseBytes = new Uint8Array(bytes.byteLength);
    responseBytes.set(bytes);
    return new NextResponse(responseBytes.buffer, { headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    } });
  } catch (error) {
    return errorResponse(error);
  }
}
