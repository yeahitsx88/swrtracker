import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { requestCancel } from '@/modules/ticket/application/request-cancel';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ctx = await getTicketRouteContext(req, ticketId);
    const repo = new TicketRepository();
    const ticket = await withTransaction((client) =>
      requestCancel(repo, client, ctx),
    );
    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err);
  }
}
