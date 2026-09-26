import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { CadReviewRepository } from '@/modules/ticket/infrastructure/cad-review.repository';
import { progressCad } from '@/modules/ticket/application/progress-cad';

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const ctx = await getTicketRouteContext(req, (await params).ticketId);
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('CAD action is required');
    const action = (body as Record<string, unknown>).action;
    if (action !== 'START' && action !== 'SUBMIT_QA') throw new ValidationError('Invalid CAD action');
    const cad = await withTransaction(db => progressCad(new TicketRepository(), new CadReviewRepository(), db, {
      tenantId: ctx.tenantId, ticketId: ctx.ticketId, actor: ctx.visibility, action,
    }));
    return NextResponse.json({ cad });
  } catch (error) { return errorResponse(error); }
}
