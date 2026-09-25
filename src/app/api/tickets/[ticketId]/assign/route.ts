/**
 * POST /api/tickets/[ticketId]/assign
 *
 * APPROVED → ASSIGNED (Variant 1) | CREATED → ASSIGNED (Variant 2).
 * Survey Manager or AOR-scoped Superintendent may assign. Crew shape follows project build.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { parseUuid } from '@/lib/parse-uuid';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { assignTicket } from '@/modules/ticket/application/assign-ticket';
import { getAssignmentOptions } from '@/modules/ticket/application/assignment-options';
import { AssignmentCandidatesRepository } from '@/modules/tenancy/infrastructure/assignment-candidates.repository';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const ctx = await getTicketRouteContext(req, (await params).ticketId);
    const query = new URL(req.url).searchParams;
    const role = query.get('role');
    if (role !== 'PARTY_CHIEF' && role !== 'INSTRUMENT_MAN') throw new ValidationError('Invalid assignment role');
    const options = await getAssignmentOptions(new TicketRepository(), new AssignmentCandidatesRepository(), pool, {
      tenantId: ctx.tenantId, ticketId: ctx.ticketId, actor: ctx.visibility, role,
      search: query.get('search') ?? '', limit: Number(query.get('limit') ?? '20'), offset: Number(query.get('offset') ?? '0'),
    });
    return NextResponse.json(options);
  } catch (error) { return errorResponse(error); }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ctx  = await getTicketRouteContext(req, ticketId);
    const body = await req.json() as unknown;
    const b    = body as Record<string, unknown>;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Assignment body is required');
    }
    if (b.assignedPartyChiefId !== undefined && b.assignedPartyChiefId !== null &&
        typeof b.assignedPartyChiefId !== 'string') {
      throw new ValidationError('assignedPartyChiefId must be a UUID');
    }
    if (b.assignedInstrumentManId !== undefined && b.assignedInstrumentManId !== null &&
        typeof b.assignedInstrumentManId !== 'string') {
      throw new ValidationError('assignedInstrumentManId must be a UUID');
    }

    const assignedPartyChiefId = typeof b.assignedPartyChiefId === 'string'
      ? parseUuid(b.assignedPartyChiefId, 'assignedPartyChiefId') : null;

    const assignedInstrumentManId =
      typeof b.assignedInstrumentManId === 'string'
        ? parseUuid(b.assignedInstrumentManId, 'assignedInstrumentManId')
        : null;

    const repo   = new TicketRepository();
    const ticket = await withTransaction((client) =>
      assignTicket(repo, client, {
        tenantId:                ctx.tenantId,
        ticketId:                ctx.ticketId,
        actorId:                 ctx.actorId,
        actorRole:               ctx.actorRole,
        assignedPartyChiefId,
        assignedInstrumentManId,
      }),
    );

    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err);
  }
}
