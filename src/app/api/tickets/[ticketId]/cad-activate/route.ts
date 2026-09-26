import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { parseUuid } from '@/lib/parse-uuid';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { CadReviewRepository } from '@/modules/ticket/infrastructure/cad-review.repository';
import { activateCad } from '@/modules/ticket/application/activate-cad';

import { pool } from '@/lib/db';
import { getCadOptions } from '@/modules/ticket/application/cad-options';
import { CadSummaryRepository } from '@/modules/ticket/infrastructure/cad-summary.repository';
import { CadAssigneesRepository } from '@/modules/tenancy/infrastructure/cad-assignees.repository';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const ctx = await getTicketRouteContext(req, (await params).ticketId);
    const query = new URL(req.url).searchParams;
    return NextResponse.json(await getCadOptions(new TicketRepository(), new CadSummaryRepository(),
      new CadAssigneesRepository(), pool, {
        tenantId: ctx.tenantId, ticketId: ctx.ticketId, actor: ctx.visibility,
        search: query.get('search') ?? '', limit: Number(query.get('limit') ?? '20'), offset: Number(query.get('offset') ?? '0'),
      }));
  } catch (error) { return errorResponse(error); }
}
export async function POST(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const ctx = await getTicketRouteContext(req, (await params).ticketId);
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body as Record<string, unknown>).assigneeId !== 'string') {
      throw new ValidationError('CAD assignee is required');
    }
    const assigneeId = parseUuid((body as { assigneeId: string }).assigneeId, 'assigneeId');
    const cad = await withTransaction(db => activateCad(new TicketRepository(), new CadReviewRepository(), db, {
      tenantId: ctx.tenantId, ticketId: ctx.ticketId, actor: ctx.visibility, assigneeId,
    }));
    return NextResponse.json({ cad });
  } catch (error) { return errorResponse(error); }
}
