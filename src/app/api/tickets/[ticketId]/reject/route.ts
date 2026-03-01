import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { rejectTicket } from '@/modules/ticket/application/reject-ticket';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ctx = await getTicketRouteContext(req, ticketId);

    const body = await req.json() as unknown;
    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).rejectionReason !== 'string') {
      throw new ValidationError('rejectionReason is required');
    }
    const { rejectionReason } = body as { rejectionReason: string };

    const repo = new TicketRepository();
    const ticket = await withTransaction((client) =>
      rejectTicket(repo, client, { ...ctx, rejectionReason }),
    );
    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err);
  }
}
