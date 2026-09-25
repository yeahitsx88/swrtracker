import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ctx = await getTicketRouteContext(req, ticketId);
    const repo = new TicketRepository();
    const ticket = await withTransaction(async (client) => {
      const email = await repo.findUserEmail(client, ctx.tenantId, ctx.actorId);
      const isWhitelisted = email ? await new TenancyRepository().isEmailWhitelisted(
        client, ctx.tenantId, ctx.projectId, email) : false;
      return submitTicket(repo, client, { ...ctx, isWhitelisted });
    });
    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err);
  }
}
