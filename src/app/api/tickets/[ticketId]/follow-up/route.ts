import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { withRequestCorrelation } from '@/lib/correlation';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { createFollowUpTicket } from '@/modules/ticket/application/create-follow-up-ticket';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';

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
      const result = await withTransaction((db) => executeIdempotentHttpMutation(
        db,
        {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          endpoint: `POST:/api/tickets/${ctx.ticketId}/follow-up`,
          idempotencyKey,
        },
        { parentTicketId: ctx.ticketId },
        async () => ({
          status: 201,
          body: {
            ticket: await createFollowUpTicket(repo, db, {
              tenantId: ctx.tenantId,
              parentTicketId: ctx.ticketId,
              actorId: ctx.actorId,
              actorRole: ctx.actorRole,
              visibility: ctx.visibility,
            }),
          },
        }),
      ));

      return NextResponse.json(result.body, { status: result.status });
    } catch (err) {
      return errorResponse(err);
    }
  });
}
