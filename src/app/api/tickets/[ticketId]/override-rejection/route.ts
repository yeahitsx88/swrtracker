/**
 * POST /api/tickets/[ticketId]/override-rejection
 * REJECTED → APPROVED (CLAUDE.md §6 — Permitted Non-Standard Transition).
 * APPROVER only. Written reason required.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { overrideRejection } from '@/modules/ticket/application/override-rejection';

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
        typeof (body as Record<string, unknown>).reason !== 'string') {
      throw new ValidationError('reason is required');
    }
    const { reason } = body as { reason: string };

    const repo = new TicketRepository();
    const ticket = await withTransaction((client) =>
      overrideRejection(repo, client, { ...ctx, reason }),
    );
    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err);
  }
}
