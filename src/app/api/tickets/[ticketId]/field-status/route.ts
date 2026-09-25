import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { submitFieldStatus, resolveFieldStatus, restartDelayed } from '@/modules/ticket/application/field-status';
import { ValidationError } from '@/shared/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const { ticketId } = await params;
    const ctx = await getTicketRouteContext(req, ticketId);
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object' || typeof body.action !== 'string') {
      throw new ValidationError('action is required');
    }
    if (body.reason !== undefined && typeof body.reason !== 'string') {
      throw new ValidationError('reason must be a string');
    }
    const repo = new TicketRepository();
    const ticket = await withTransaction(client => {
      switch (body.action) {
        case 'SUBMIT':
          if (body.requestedStatus !== 'COMPLETED' && body.requestedStatus !== 'DELAYED' &&
              body.requestedStatus !== 'FIELD_CANCELED') {
            throw new ValidationError('Invalid requestedStatus');
          }
          return submitFieldStatus(repo, client, { ...ctx,
            requestedStatus: body.requestedStatus, reason: body.reason as string | undefined });
        case 'APPROVE':
        case 'REJECT':
          return resolveFieldStatus(repo, client, { ...ctx, approve: body.action === 'APPROVE',
            reason: body.reason as string | undefined });
        case 'RESTART':
          return restartDelayed(repo, client, ctx);
        default:
          throw new ValidationError('Invalid action');
      }
    });
    return NextResponse.json({ ticket });
  } catch (err) { return errorResponse(err); }
}
