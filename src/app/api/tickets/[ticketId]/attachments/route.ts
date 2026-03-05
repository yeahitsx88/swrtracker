import type { NextRequest } from 'next/server';
import {
  handleGetTicketAttachments,
  handlePostTicketAttachments,
} from './handler';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ ticketId: string }> },
) {
  return handlePostTicketAttachments(req, ctx);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ ticketId: string }> },
) {
  return handleGetTicketAttachments(req, ctx);
}
