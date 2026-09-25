import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { delayTicket } from '@/modules/ticket/application/delay-ticket';
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
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).reason !== 'string') {
      throw new ValidationError('reason is required');
    }

    const { reason } = body as { reason: string };
    const repo = new TicketRepository();
    const result = await withTransaction((client) => executeIdempotentHttpMutation(
      client,
      { tenantId: ctx.tenantId, actorId: ctx.actorId, endpoint: `POST:/api/tickets/${ticketId}/delay`, idempotencyKey },
      { ticketId, reason },
      async () => ({ status: 200, body: { ticket: await delayTicket(repo, client, { ...ctx, reason }) } }),
    ));
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}
