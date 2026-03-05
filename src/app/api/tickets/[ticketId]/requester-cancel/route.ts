import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { withRequestCorrelation } from '@/lib/correlation';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { requesterCancel } from '@/modules/ticket/application/requester-cancel';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  return withRequestCorrelation(req, async () => {
    try {
      const { ticketId } = await params;
      const idempotencyKey = requireIdempotencyKey(req);
      const ctx = await getTicketRouteContext(req, ticketId);
      const repo = new TicketRepository();
      const result = await withTransaction((client) =>
        executeIdempotentHttpMutation(
          client,
          {
            tenantId: ctx.tenantId,
            actorId: ctx.actorId,
            endpoint: `POST:/api/tickets/${ctx.ticketId}/requester-cancel`,
            idempotencyKey,
          },
          { ticketId: ctx.ticketId },
          async () => {
            const ticket = await requesterCancel(repo, client, ctx);
            return { status: 200, body: { ticket } };
          },
        ),
      );
      return NextResponse.json(result.body, { status: result.status });
    } catch (err) {
      return errorResponse(err);
    }
  });
}
