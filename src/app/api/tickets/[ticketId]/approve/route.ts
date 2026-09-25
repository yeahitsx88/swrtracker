import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { approveTicket } from '@/modules/ticket/application/approve-ticket';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const idempotencyKey = requireIdempotencyKey(req);
    const ctx = await getTicketRouteContext(req, ticketId);
    const repo = new TicketRepository();
    const result = await withTransaction((client) => executeIdempotentHttpMutation(
      client,
      { tenantId: ctx.tenantId, actorId: ctx.actorId, endpoint: `POST:/api/tickets/${ticketId}/approve`, idempotencyKey },
      { ticketId },
      async () => ({ status: 200, body: { ticket: await approveTicket(repo, client, ctx) } }),
    ));
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}
