import {observeProjectRoute} from '@/lib/observe-project-route';
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTicketMutation } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { rejectTicket } from '@/modules/ticket/application/reject-ticket';
import { requireIdempotencyKey } from '@/lib/idempotency';
import { executeAuthorizedTicketMutation } from '@/lib/ticket-mutation-idempotency';

export const dynamic = 'force-dynamic';

async function observedPOST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ctx = await getTicketRouteContext(req, ticketId);
    const idempotencyKey=requireIdempotencyKey(req);

    const body = await req.json() as unknown;
    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).rejectionReason !== 'string') {
      throw new ValidationError('rejectionReason is required');
    }
    const { rejectionReason } = body as { rejectionReason: string };

    const repo = new TicketRepository();
    const result = await withTicketMutation(req, ctx, (client, ctx) => executeAuthorizedTicketMutation(client,
      {tenantId:ctx.tenantId,actorId:ctx.actorId,endpoint:`POST:/api/tickets/${ticketId}/reject`,idempotencyKey},
      {ticketId,rejectionReason},async()=>({status:200,body:{ticket:await rejectTicket(repo,client,{...ctx,rejectionReason})}})));
    return NextResponse.json(result.body,{status:result.status});
  } catch (err) {
    return errorResponse(err);
  }
}

export const POST=observeProjectRoute(observedPOST);
