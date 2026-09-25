import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { withRequestCorrelation } from '@/lib/correlation';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { revisePriority } from '@/modules/ticket/application/revise-priority';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { TicketPriority } from '@/modules/ticket/domain/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  return withRequestCorrelation(req, async () => {
    try {
      const { ticketId } = await params;
      const ctx = await getTicketRouteContext(req, ticketId);
      const idempotencyKey = requireIdempotencyKey(req);
      const body = await req.json() as Record<string, unknown>;
      if ((body.priority !== 'NORMAL' && body.priority !== 'HIGH') || typeof body.reason !== 'string') {
        throw new ValidationError('priority and reason are required');
      }
      const repo = new TicketRepository();
      const result = await withTransaction((db) => executeIdempotentHttpMutation(
        db,
        { tenantId: ctx.tenantId, actorId: ctx.actorId, endpoint: `POST:/api/tickets/${ticketId}/priority`, idempotencyKey },
        { ticketId, priority: body.priority, reason: body.reason },
        async () => ({
          status: 200,
          body: { ticket: await revisePriority(repo, db, {
            ...ctx,
            priority: body.priority as TicketPriority,
            reason: body.reason as string,
          }) },
        }),
      ));
      return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
