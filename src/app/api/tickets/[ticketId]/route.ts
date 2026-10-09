import {observeProjectRoute} from '@/lib/observe-project-route';
/**
 * GET /api/tickets/[ticketId]
 *
 * Visibility enforced: actors only receive tickets they are permitted to see
 * per their role (CLAUDE.md §7A). Returns 404 for both missing and not-visible
 * tickets — no information leakage.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError, NotFoundError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { assertRecommissioningMutation, findPreparationCleanupTickets } from '@/lib/recommissioning-gate';
import { getTicketRouteContext, withTicketMutation, withTicketRead } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import { updateRequesterTicket } from '@/modules/ticket/application/update-requester-ticket';
import { getTicketCapabilities } from '@/modules/ticket/application/get-ticket-capabilities';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { parseRequesterIntake } from '@/lib/requester-intake-input';
import { requireActiveAuth } from '@/lib/auth';
import { lockDraftActor, lockRequesterTicket } from '@/modules/ticket/application/draft-access';

export const dynamic = 'force-dynamic';

async function observedGET(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ctx  = await getTicketRouteContext(req, ticketId);
    return await withTicketRead(req, ctx, async (db, ctx) => {
      const repo = new TicketRepository();

      const ticket = await repo.findById(db, ctx.tenantId, ctx.ticketId, ctx.visibility);
      if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);
      const requester = await new UserRepository().findById(
        db, ctx.tenantId, ticket.requesterId,
      );

      // These read-only writer gates restrict availability; they grant no actor authority.
      const availability = { ordinary: true, submit: false, requesterCancel: true, deleteDraft: true, approveSurveyCancel: true };
      for (const [action, suffix] of [['ordinary', ''], ['requesterCancel', '/requester-cancel'], ['deleteDraft', '/draft'], ['approveSurveyCancel', '/survey-cancel/approve']] as const) {
        try {
          await assertRecommissioningMutation(db, ctx.tenantId, ctx.projectId, `/api/tickets/${ticketId}${suffix}`);
        } catch (err) {
          if (!(err instanceof ConflictError)) throw err;
          availability[action] = false;
        }
      }
      const projectStatus = await repo.findProjectStatus(db, ctx.tenantId, ctx.projectId);
      if (!projectStatus) throw new NotFoundError('Project not found');
      availability.submit = availability.ordinary && projectStatus === 'ACTIVE';
      const cleanup = await findPreparationCleanupTickets(db, ctx.tenantId, ctx.projectId, [ticket.id]);

      return NextResponse.json({
        ticket: {
          ...ticket,
          requesterName: requester?.name ?? 'Unknown requester',
          isOwnRequest: ticket.requesterId === ctx.actorId,
          preparationCleanupAllowed: cleanup.has(ticket.id),
        },
        capabilities: getTicketCapabilities(ticket, { id: ctx.actorId, role: ctx.actorRole }, availability),
      }, {headers: {'Cache-Control': 'private, no-store'}});
    });
  } catch (err) {
    return errorResponse(err);
  }
}

async function observedPATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const idempotencyKey = requireIdempotencyKey(req);
    const ctx = await getTicketRouteContext(req, ticketId);
    const body = await req.json() as Record<string, unknown>;
    const { changes, expectedVersion } = parseRequesterIntake(body);
    const auth = await requireActiveAuth(req);
    const repo = new TicketRepository();
    const result = await withTicketMutation(req, ctx, async (db, ctx) => {
      await lockDraftActor(db, { ...ctx, sessionVersion: auth.sessionVersion }, 'REQUESTER');
      await lockRequesterTicket(db, ctx);
      return executeIdempotentHttpMutation(
      db,
      { tenantId: ctx.tenantId, actorId: ctx.actorId, endpoint: `PATCH:/api/tickets/${ticketId}`, idempotencyKey },
      body,
      async () => ({
        status: 200,
        body: { ticket: await updateRequesterTicket(repo, db, { ...ctx, changes, expectedVersion }) },
      }),
    ); });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET=observeProjectRoute(observedGET);
export const PATCH=observeProjectRoute(observedPATCH);
