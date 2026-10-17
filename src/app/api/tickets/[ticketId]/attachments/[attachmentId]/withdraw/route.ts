import { observeProjectRoute } from '@/lib/observe-project-route';
import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { getTicketRouteContext, withTicketMutation } from '@/lib/ticket-route-helpers';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { readJsonBody } from '@/lib/read-json-body';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { normalizeWithdrawalReason, withdrawAttachment } from '@/modules/attachment/application/withdraw-attachment';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

/** POST — the uploader withdraws a mistaken file; the record and bytes are retained. */
async function observedPOST(req: NextRequest, { params }: { params: Promise<{ ticketId: string; attachmentId: string }> }) {
  try {
    const { ticketId, attachmentId } = await params;
    const expected = await getTicketRouteContext(req, ticketId);
    requireResourceUuid(attachmentId, 'attachmentId');
    const key = requireIdempotencyKey(req);
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'reason')) {
      throw new ValidationError('Send only a withdrawal reason.');
    }
    const reason = normalizeWithdrawalReason((body as { reason?: unknown }).reason);
    const repo = new TicketRepository();
    const result = await withTicketMutation(req, expected, (db, ctx) => executeIdempotentHttpMutation(db,
      { tenantId: ctx.tenantId, actorId: ctx.actorId, endpoint: `POST /api/tickets/${ctx.ticketId}/attachments/${attachmentId}/withdraw`, idempotencyKey: key },
      { reason },
      async () => {
        await db.query('SELECT id FROM tickets WHERE tenant_id = $1 AND project_id = $2 AND id = $3 FOR UPDATE', [ctx.tenantId, ctx.projectId, ctx.ticketId]);
        const ticket = await repo.findById(db, ctx.tenantId, ctx.ticketId, ctx.visibility);
        if (!ticket) throw new NotFoundError('Ticket not found');
        const projectStatus = await repo.findProjectStatus(db, ctx.tenantId, ctx.projectId);
        if (!projectStatus) throw new NotFoundError('Project not found');
        const withdrawn = await withdrawAttachment(db, {
          tenantId: ctx.tenantId, ticketId: ctx.ticketId, attachmentId: attachmentId as UUID,
          actorId: ctx.actorId, actorRole: ctx.actorRole, reason, projectStatus, ticket,
        });
        return { status: 200, body: withdrawn };
      }));
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}

export const POST = observeProjectRoute(observedPOST);
