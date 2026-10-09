import {observeProjectRoute} from '@/lib/observe-project-route';
import type { NextRequest } from 'next/server';
import {
  handleGetTicketAttachments,
  handlePostTicketAttachments,
} from './handler';

export const dynamic = 'force-dynamic';

async function observedPOST(
  req: NextRequest,
  ctx: { params: Promise<{ ticketId: string }> },
) {
  return handlePostTicketAttachments(req, ctx);
}

async function observedGET(
  req: NextRequest,
  ctx: { params: Promise<{ ticketId: string }> },
) {
  return handleGetTicketAttachments(req, ctx);
}

export const POST=observeProjectRoute(observedPOST);
export const GET=observeProjectRoute(observedGET);
