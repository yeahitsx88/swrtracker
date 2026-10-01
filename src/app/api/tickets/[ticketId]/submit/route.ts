import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTransaction } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { requireActiveAuth } from '@/lib/auth';
import { lockDraftActor, lockRequesterTicket } from '@/modules/ticket/application/draft-access';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const idempotencyKey = requireIdempotencyKey(req);
    const ctx = await getTicketRouteContext(req, ticketId);
    const auth = await requireActiveAuth(req);
    const repo = new TicketRepository();
    const rawBody = await req.text();
    const body = rawBody ? JSON.parse(rawBody) as unknown : {};
    const expectedVersion = body && typeof body === 'object' ? (body as { expectedVersion?: unknown }).expectedVersion : undefined;
    if (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0)) {
      throw new ValidationError('expectedVersion must be a nonnegative integer');
    }
    const departmentId = (body && typeof body === 'object' && 'departmentId' in body)
      ? (body as { departmentId?: unknown }).departmentId
      : undefined;
    const urgentReason = (body && typeof body === 'object' && 'urgentReason' in body)
      ? (body as { urgentReason?: unknown }).urgentReason
      : undefined;
    if (departmentId !== undefined && typeof departmentId !== 'string') {
      throw new ValidationError('departmentId must be a string when provided');
    }
    if (urgentReason !== undefined && typeof urgentReason !== 'string') {
      throw new ValidationError('urgentReason must be a string when provided');
    }
    const result = await withTransaction(async (client) => {
      await lockDraftActor(client, { ...ctx, sessionVersion: auth.sessionVersion }, 'REQUESTER');
      await lockRequesterTicket(client, ctx);
      return executeIdempotentHttpMutation(
      client,
      { tenantId: ctx.tenantId, actorId: ctx.actorId, endpoint: `POST:/api/tickets/${ticketId}/submit`, idempotencyKey },
      { ticketId, departmentId: departmentId ?? null, urgentReason: urgentReason ?? null,
        ...(expectedVersion !== undefined ? { expectedVersion } : {}) },
      async () => ({
        status: 200,
        body: { ticket: await submitTicket(repo, client, {
          ...ctx,
          departmentId: departmentId as UUID | undefined,
          urgentReason: urgentReason as string | undefined,
          expectedVersion: expectedVersion as number | undefined,
        }) },
      }),
    ); });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}
