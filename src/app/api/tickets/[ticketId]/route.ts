/**
 * GET /api/tickets/[ticketId]
 *
 * Visibility enforced: actors only receive tickets they are permitted to see
 * per their role (CLAUDE.md §7A). Returns 404 for both missing and not-visible
 * tickets — no information leakage.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { NotFoundError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { getTicketRouteContext } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ctx  = await getTicketRouteContext(req, ticketId);
    const repo = new TicketRepository();

    const ticket = await repo.findById(pool, ctx.tenantId, ctx.ticketId, ctx.visibility);
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);

    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err);
  }
}