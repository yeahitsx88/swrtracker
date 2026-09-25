import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { parseUuid } from '@/lib/parse-uuid';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { reassignSuperintendent } from '@/modules/ticket/application/reassign-superintendent';
import { getSuperintendentOptions } from '@/modules/ticket/application/superintendent-options';
import { AssignmentCandidatesRepository } from '@/modules/tenancy/infrastructure/assignment-candidates.repository';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const ctx = await getTicketRouteContext(req, (await params).ticketId);
    const query = new URL(req.url).searchParams;
    return NextResponse.json(await getSuperintendentOptions(new TicketRepository(),
      new AssignmentCandidatesRepository(), pool, {
        tenantId: ctx.tenantId, ticketId: ctx.ticketId, actor: ctx.visibility,
        search: query.get('search') ?? '', limit: Number(query.get('limit') ?? '20'),
        offset: Number(query.get('offset') ?? '0'),
      }));
  } catch (error) { return errorResponse(error); }
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
    if (typeof input.superintendentId !== 'string' || typeof input.reason !== 'string') {
      throw new ValidationError('Superintendent and written reason are required');
    }
    const superintendentId = parseUuid(input.superintendentId, 'superintendentId');
    const reason = input.reason;
    const ticket = await withTransaction(db => reassignSuperintendent(new TicketRepository(), db, {
      tenantId: ctx.tenantId, ticketId: ctx.ticketId, actor: ctx.visibility, superintendentId, reason,
    }));
    return NextResponse.json({ ticket });
  } catch (error) { return errorResponse(error); }
}
