import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { initiateSurveyCancel, approveSurveyCancel } from '@/modules/ticket/application/survey-cancel';
import { ValidationError } from '@/shared/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const { ticketId } = await params;
    const ctx = await getTicketRouteContext(req, ticketId);
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object' ||
      (body.action !== 'INITIATE' && body.action !== 'APPROVE')) {
      throw new ValidationError('Invalid action');
    }
    if (body.action === 'INITIATE' && typeof body.reason !== 'string') {
      throw new ValidationError('A written cancellation reason is required');
    }
    const repo = new TicketRepository();
    const ticket = await withTransaction(client => body.action === 'INITIATE'
      ? initiateSurveyCancel(repo, client, { ...ctx, reason: body.reason as string })
      : approveSurveyCancel(repo, client, ctx));
    return NextResponse.json({ ticket });
  } catch (err) { return errorResponse(err); }
}
