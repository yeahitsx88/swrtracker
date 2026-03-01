/**
 * POST /api/tickets/[ticketId]/assign
 *
 * APPROVED → ASSIGNED (Variant 1) | CREATED → ASSIGNED (Variant 2).
 * Permitted actor: SURVEY_LEAD.
 * assignedPartyChiefId is required; assignedInstrumentManId is optional.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { assignTicket } from '@/modules/ticket/application/assign-ticket';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ctx  = await getTicketRouteContext(req, ticketId);
    const body = await req.json() as unknown;
    const b    = body as Record<string, unknown>;

    if (!body || typeof body !== 'object' || typeof b.assignedPartyChiefId !== 'string') {
      throw new ValidationError('assignedPartyChiefId is required');
    }

    const assignedInstrumentManId =
      typeof b.assignedInstrumentManId === 'string'
        ? b.assignedInstrumentManId as UUID
        : null;

    const repo   = new TicketRepository();
    const ticket = await withTransaction((client) =>
      assignTicket(repo, client, {
        tenantId:                ctx.tenantId,
        ticketId:                ctx.ticketId,
        actorId:                 ctx.actorId,
        actorRole:               ctx.actorRole,
        assignedPartyChiefId:    b.assignedPartyChiefId as UUID,
        assignedInstrumentManId,
        surveyLeadId:            ctx.actorId,
      }),
    );

    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err);
  }
}