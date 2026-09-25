import type { NextRequest } from 'next/server';
import { handleDownloadTicketAttachment } from '../handler';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ ticketId: string; attachmentId: string }> },
) {
  return handleDownloadTicketAttachment(req, ctx);
}
