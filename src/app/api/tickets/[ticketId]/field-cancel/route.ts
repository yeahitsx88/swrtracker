import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { withRequestCorrelation } from '@/lib/correlation';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { requestFieldCancel } from '@/modules/ticket/application/request-field-cancel';

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
      const body = await req.json().catch(() => ({})) as unknown;

    if (body !== null && typeof body !== 'object') {
      throw new ValidationError('request body must be an object when provided');
    }

    const reason =
      typeof (body as Record<string, unknown>).reason === 'string'
        ? (body as Record<string, unknown>).reason as string
        : undefined;

    const repo = new TicketRepository();
    const result = await withTransaction((client) =>
      executeIdempotentHttpMutation(
        client,
        {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          endpoint: `POST:/api/tickets/${ctx.ticketId}/field-cancel`,
          idempotencyKey,
        },
        { ticketId: ctx.ticketId, reason: reason ?? null },
        async () => {
          const ticket = await requestFieldCancel(repo, client, { ...ctx, reason });
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
