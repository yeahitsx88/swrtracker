import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { rejectPcStatus } from '@/modules/ticket/application/reject-pc-status';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
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
    const ticket = await withTransaction((client) =>
      rejectPcStatus(repo, client, { ...ctx, reason }),
    );
    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err);
  }
}
