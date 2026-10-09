import { observeProjectRoute } from '@/lib/observe-project-route';
import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { getTicketRouteContext, withTicketMutation } from '@/lib/ticket-route-helpers';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { readJsonBody } from '@/lib/read-json-body';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { addTicketComment, canCommentOn, listTicketComments, normalizeCommentBody } from '@/modules/ticket/application/ticket-comments';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/** GET — the conversation on a request the caller can see, plus whether they may post. */
async function observedGET(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const { ticketId } = await params;
    const ctx = await getTicketRouteContext(req, ticketId);
    const ticket = await new TicketRepository().findById(pool, ctx.tenantId, ctx.ticketId, ctx.visibility);
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);
    const comments = await listTicketComments(pool, ctx.tenantId, ctx.ticketId);
    return NextResponse.json({ comments, canComment: canCommentOn(ticket, ctx.actorId, ctx.actorRole) }, { headers });
  } catch (error) { return errorResponse(error); }
}

/** POST — add a comment; participants other than the author are notified. */
async function observedPOST(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const { ticketId } = await params;
    const expected = await getTicketRouteContext(req, ticketId);
    const key = requireIdempotencyKey(req);
    const raw = await readJsonBody(req);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => k !== 'body')) throw new ValidationError('Send only the comment text.');
    const body = normalizeCommentBody((raw as { body?: unknown }).body);
    const repo = new TicketRepository();
    const result = await withTicketMutation(req, expected, (db, ctx) => executeIdempotentHttpMutation(db,
      { tenantId: ctx.tenantId, actorId: ctx.actorId, endpoint: `POST /api/tickets/${ctx.ticketId}/comments`, idempotencyKey: key },
      { body },
      async () => {
        await db.query('SELECT id FROM tickets WHERE tenant_id = $1 AND project_id = $2 AND id = $3 FOR UPDATE', [ctx.tenantId, ctx.projectId, ctx.ticketId]);
        const ticket = await repo.findById(db, ctx.tenantId, ctx.ticketId, ctx.visibility);
        if (!ticket) throw new NotFoundError('Ticket not found');
        const projectStatus = await repo.findProjectStatus(db, ctx.tenantId, ctx.projectId);
        if (!projectStatus) throw new NotFoundError('Project not found');
        const comment = await addTicketComment(db, { tenantId: ctx.tenantId, projectId: ctx.projectId, actorId: ctx.actorId, actorRole: ctx.actorRole, projectStatus, ticket, body });
        return { status: 201, body: { comment } };
      }));
    return NextResponse.json(result.body, { status: result.status, headers });
  } catch (error) { return errorResponse(error); }
}

export const GET = observeProjectRoute(observedGET);
export const POST = observeProjectRoute(observedPOST);
