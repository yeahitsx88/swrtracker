import { NextResponse, type NextRequest } from 'next/server';
import { NotFoundError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { getTicketRouteContext } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { listTicketHistory } from '@/modules/ticket/infrastructure/ticket-history.repository';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { TicketHistoryItem } from '@/lib/contracts';
import type { UUID } from '@/shared/types';

export interface TicketHistoryRouteDeps {
  getTicketRouteContext: typeof getTicketRouteContext;
  createTicketRepo: () => ITicketRepository;
  listHistory: (tenantId: UUID, ticketId: UUID) => Promise<TicketHistoryItem[]>;
}

const defaultDeps: TicketHistoryRouteDeps = {
  getTicketRouteContext,
  createTicketRepo: () => new TicketRepository(),
  listHistory: (tenantId, ticketId) => listTicketHistory(pool, tenantId, ticketId),
};

export async function handleGetTicketHistory(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
  deps: TicketHistoryRouteDeps = defaultDeps,
) {
  try {
    const { ticketId } = await params;
    const ctx = await deps.getTicketRouteContext(req, ticketId);
    const ticket = await deps.createTicketRepo().findById(pool, ctx.tenantId, ctx.ticketId, ctx.visibility);
    if (!ticket) throw new NotFoundError(`Ticket ${ctx.ticketId} not found`);
    return NextResponse.json({ history: await deps.listHistory(ctx.tenantId, ctx.ticketId) });
  } catch (err) {
    return errorResponse(err);
  }
}
