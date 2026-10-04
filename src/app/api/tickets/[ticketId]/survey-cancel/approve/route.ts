import {observeProjectRoute} from '@/lib/observe-project-route';
import { NextResponse, type NextRequest } from 'next/server';
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
    const repo = new TicketRepository();
    const ticket = await withTicketMutation(req, ctx, (client, ctx) =>
      approveSurveyCancel(repo, client, ctx),
    );
    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err);
  }
}

export const POST=observeProjectRoute(observedPOST);
