import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { parseUuid } from '@/lib/parse-uuid';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { HelpFlagRepository } from '@/modules/ticket/infrastructure/help-flag.repository';
import { reassignCrew } from '@/modules/ticket/application/reassign-crew';
import { getReassignmentOptions } from '@/modules/ticket/application/reassignment-options';
import { AssignmentCandidatesRepository } from '@/modules/tenancy/infrastructure/assignment-candidates.repository';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const ctx = await getTicketRouteContext(req, (await params).ticketId);
    const query = new URL(req.url).searchParams;
    const role = query.get('role');
    if (role !== 'PARTY_CHIEF' && role !== 'INSTRUMENT_MAN') {
      throw new ValidationError('Invalid assignment role');
    }
    const options = await getReassignmentOptions(new TicketRepository(),
      new AssignmentCandidatesRepository(), pool, {
        tenantId: ctx.tenantId, ticketId: ctx.ticketId, actor: ctx.visibility, role,
        search: query.get('search') ?? '', limit: Number(query.get('limit') ?? '20'),
        offset: Number(query.get('offset') ?? '0'),
      });
    return NextResponse.json(options);
  } catch (error) { return errorResponse(error); }
}

function optionalUuid(value: unknown, field: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a UUID`);
  return parseUuid(value, field);
}

export async function POST(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const ctx = await getTicketRouteContext(req, (await params).ticketId);
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Reassignment body is required');
    }
    const input = body as Record<string, unknown>;
    if (typeof input.reason !== 'string') {
      throw new ValidationError('reason must be text');
    }
    const ticket = await withTransaction((db) => reassignCrew(
      new TicketRepository(), new HelpFlagRepository(), db,
      { tenantId: ctx.tenantId, ticketId: ctx.ticketId,
        actorId: ctx.actorId, actorRole: ctx.actorRole,
        assignedPartyChiefId: optionalUuid(input.assignedPartyChiefId,
          'assignedPartyChiefId'),
        assignedInstrumentManId: optionalUuid(input.assignedInstrumentManId,
          'assignedInstrumentManId'), reason: input.reason as string },
    ));
    return NextResponse.json({ ticket });
  } catch (error) { return errorResponse(error); }
}
