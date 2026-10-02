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
import { getTicketRouteContext, withTicketMutation } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import { updateRequesterTicket } from '@/modules/ticket/application/update-requester-ticket';
import { getTicketCapabilities } from '@/modules/ticket/application/get-ticket-capabilities';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { parseRequesterIntake } from '@/lib/requester-intake-input';
import { requireActiveAuth } from '@/lib/auth';
import { lockDraftActor, lockRequesterTicket } from '@/modules/ticket/application/draft-access';

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
    const requester = await new UserRepository().findById(
      pool, ctx.tenantId, ticket.requesterId,
    );

    return NextResponse.json({
      ticket: {
        ...ticket,
        requesterName: requester?.name ?? 'Unknown requester',
        isOwnRequest: ticket.requesterId === ctx.actorId,
      },
      capabilities: getTicketCapabilities(ticket, { id: ctx.actorId, role: ctx.actorRole }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const idempotencyKey = requireIdempotencyKey(req);
    const ctx = await getTicketRouteContext(req, ticketId);
    const body = await req.json() as Record<string, unknown>;
    const { changes, expectedVersion } = parseRequesterIntake(body);
    const auth = await requireActiveAuth(req);
    const repo = new TicketRepository();
    const result = await withTicketMutation(req, ctx, async (db, ctx) => {
      await lockDraftActor(db, { ...ctx, sessionVersion: auth.sessionVersion }, 'REQUESTER');
      await lockRequesterTicket(db, ctx);
      return executeIdempotentHttpMutation(
      db,
      { tenantId: ctx.tenantId, actorId: ctx.actorId, endpoint: `PATCH:/api/tickets/${ticketId}`, idempotencyKey },
      body,
      async () => ({
        status: 200,
        body: { ticket: await updateRequesterTicket(repo, db, { ...ctx, changes, expectedVersion }) },
      }),
    ); });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}
