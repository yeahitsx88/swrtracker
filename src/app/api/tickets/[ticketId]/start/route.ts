import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTicketMutation } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { startTicket } from '@/modules/ticket/application/start-ticket';
import { requireIdempotencyKey } from '@/lib/idempotency';
import { executeAuthorizedTicketMutation } from '@/lib/ticket-mutation-idempotency';

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
    const result = await withTicketMutation(req, ctx, (client, ctx) => executeAuthorizedTicketMutation(
      client,
      { tenantId: ctx.tenantId, actorId: ctx.actorId, endpoint: `POST:/api/tickets/${ticketId}/start`, idempotencyKey },
      { ticketId },
      async () => ({ status: 200, body: { ticket: await startTicket(repo, client, ctx) } }),
    ));
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}
