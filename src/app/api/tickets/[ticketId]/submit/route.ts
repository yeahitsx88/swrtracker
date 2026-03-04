import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ctx = await getTicketRouteContext(req, ticketId);
    const repo = new TicketRepository();
    const rawBody = await req.text();
    const body = rawBody ? JSON.parse(rawBody) as unknown : {};
    const departmentId = (body && typeof body === 'object' && 'departmentId' in body)
      ? (body as { departmentId?: unknown }).departmentId
      : undefined;
    if (departmentId !== undefined && typeof departmentId !== 'string') {
      throw new ValidationError('departmentId must be a string when provided');
    }
    const ticket = await withTransaction((client) =>
      submitTicket(repo, client, {
        ...ctx,
        departmentId: departmentId as UUID | undefined,
      }),
    );
    return NextResponse.json({ ticket });
  } catch (err) {
    return errorResponse(err);
  }
}
