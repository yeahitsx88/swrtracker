import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { lowerPriority } from '@/modules/ticket/application/lower-priority';
import type { Ticket } from '@/modules/ticket/domain/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const { ticketId } = await params;
    const ctx = await getTicketRouteContext(req, ticketId);
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Priority change body is required');
    }
    const input = body as Record<string, unknown>;
    if (typeof input.priority !== 'string' || typeof input.reason !== 'string' ||
        typeof input.highDowngradeConfirmed !== 'boolean') {
      throw new ValidationError('priority, reason and highDowngradeConfirmed are required');
    }
    if (!['NORMAL', 'MEDIUM', 'MED_HIGH', 'HIGH'].includes(input.priority)) {
      throw new ValidationError('Invalid priority');
    }
    const ticket = await withTransaction(db => lowerPriority(new TicketRepository(), db, {
      ...ctx, priority: input.priority as Ticket['priority'], reason: input.reason as string,
      highDowngradeConfirmed: input.highDowngradeConfirmed as boolean,
    }));
    return NextResponse.json({ ticket });
  } catch (error) {
    return errorResponse(error);
  }
}
