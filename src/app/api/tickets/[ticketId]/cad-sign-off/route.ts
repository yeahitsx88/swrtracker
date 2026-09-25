import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { CadReviewRepository } from '@/modules/ticket/infrastructure/cad-review.repository';
import { signOffCad } from '@/modules/ticket/application/sign-off-cad';

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const ctx = await getTicketRouteContext(req, (await params).ticketId);
    const cad = await withTransaction(db => signOffCad(new TicketRepository(), new CadReviewRepository(), db, {
      tenantId: ctx.tenantId, ticketId: ctx.ticketId, actor: ctx.visibility,
    }));
    return NextResponse.json({ cad });
  } catch (error) { return errorResponse(error); }
}
