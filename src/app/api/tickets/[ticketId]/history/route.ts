import type { NextRequest } from 'next/server';
import { handleGetTicketHistory } from './handler';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ ticketId: string }> },
) {
  return handleGetTicketHistory(req, ctx);
}
