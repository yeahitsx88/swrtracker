import {observeProjectRoute} from '@/lib/observe-project-route';
import { NextResponse, type NextRequest } from 'next/server';
import { requireIdempotencyKey } from '@/lib/idempotency';
import { executeAuthorizedTicketMutation } from '@/lib/ticket-mutation-idempotency';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTicketMutation } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { approveSurveyCancel } from '@/modules/ticket/application/approve-survey-cancel';

export const dynamic = 'force-dynamic';

async function observedPOST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ctx = await getTicketRouteContext(req, ticketId);
    const idempotencyKey = requireIdempotencyKey(req);
    const repo = new TicketRepository();
    const result = await withTicketMutation(req, ctx, (client, ctx) =>
      executeAuthorizedTicketMutation(client, {
        tenantId: ctx.tenantId, actorId: ctx.actorId,
        endpoint: `POST:/api/tickets/${ticketId}/survey-cancel/approve`, idempotencyKey,
      }, { ticketId }, async () => ({
        status: 200, body: { ticket: await approveSurveyCancel(repo, client, ctx) },
      })),
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}

export const POST=observeProjectRoute(observedPOST);
