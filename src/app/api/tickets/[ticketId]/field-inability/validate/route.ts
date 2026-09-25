import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { withRequestCorrelation } from '@/lib/correlation';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { returnTicketForCorrection } from '@/modules/ticket/application/return-ticket-for-correction';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  return withRequestCorrelation(req, async () => {
    try {
      const { ticketId } = await params;
      const ctx = await getTicketRouteContext(req, ticketId);
      const idempotencyKey = requireIdempotencyKey(req);
      const body = await req.json() as Record<string, unknown>;
      if (typeof body.reason !== 'string' || !body.reason.trim()) throw new ValidationError('reason is required');
      const repo = new TicketRepository();
      const result = await withTransaction((db) => executeIdempotentHttpMutation(
        db,
        { tenantId: ctx.tenantId, actorId: ctx.actorId, endpoint: `POST:/api/tickets/${ticketId}/field-inability/validate`, idempotencyKey },
        { ticketId, reason: body.reason },
        async () => ({
          status: 200,
          body: { ticket: await returnTicketForCorrection(repo, db, { ...ctx, reason: body.reason as string, origin: 'FIELD_INABILITY' }) },
        }),
      ));
      return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
