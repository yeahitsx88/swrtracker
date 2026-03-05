/**
 * POST /api/tickets/[ticketId]/assign
 *
 * APPROVED → ASSIGNED for the standard-approval workflow.
 * Permitted actors: SURVEY_MANAGER, SURVEY_SUPERINTENDENT.
 * assignedPartyChiefId is required; assignedInstrumentManId is optional.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { withRequestCorrelation } from '@/lib/correlation';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { assignTicket } from '@/modules/ticket/application/assign-ticket';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  return withRequestCorrelation(req, async () => {
    try {
      const { ticketId } = await params;
      const idempotencyKey = requireIdempotencyKey(req);
      const ctx  = await getTicketRouteContext(req, ticketId);
      const body = await req.json() as unknown;
      const b    = body as Record<string, unknown>;

    if (!body || typeof body !== 'object' || typeof b.assignedPartyChiefId !== 'string') {
      throw new ValidationError('assignedPartyChiefId is required');
    }

    const assignedInstrumentManId =
      typeof b.assignedInstrumentManId === 'string'
        ? b.assignedInstrumentManId as UUID
        : null;

    const repo = new TicketRepository();
    const result = await withTransaction((client) =>
      executeIdempotentHttpMutation(
        client,
        {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          endpoint: `POST:/api/tickets/${ctx.ticketId}/assign`,
          idempotencyKey,
        },
        {
          ticketId: ctx.ticketId,
          assignedPartyChiefId: b.assignedPartyChiefId,
          assignedInstrumentManId,
        },
        async () => {
          const ticket = await assignTicket(repo, client, {
            tenantId:                ctx.tenantId,
            ticketId:                ctx.ticketId,
            actorId:                 ctx.actorId,
            actorRole:               ctx.actorRole,
            assignedPartyChiefId:    b.assignedPartyChiefId as UUID,
            assignedInstrumentManId,
            surveyLeadId:            ctx.actorId,
            visibility:              ctx.visibility,
          });
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
