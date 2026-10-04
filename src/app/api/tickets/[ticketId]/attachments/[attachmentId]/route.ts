import {observeProjectRoute} from '@/lib/observe-project-route';
import type { NextRequest } from 'next/server';
import { handleDownloadTicketAttachment } from '../handler';

export const dynamic = 'force-dynamic';

async function observedGET(
  req: NextRequest,
  ctx: { params: Promise<{ ticketId: string; attachmentId: string }> },
) {
  return handleDownloadTicketAttachment(req, ctx);
}

export const GET=observeProjectRoute(observedGET);
