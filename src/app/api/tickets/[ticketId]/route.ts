/**
 * GET /api/tickets/[ticketId]
 *
 * Visibility enforced: actors only receive tickets they are permitted to see
 * per their role (CLAUDE.md §7A). Returns 404 for both missing and not-visible
 * tickets — no information leakage.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { NotFoundError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { getTicketReadContext } from '@/lib/ticket-route-helpers';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { statusLabel } from '@/modules/ticket/domain/status-label';
import { getRequesterActions } from '@/modules/ticket/application/requester-actions';
import { getReviewActions } from '@/modules/ticket/application/review-actions';
import { getAssignmentCapability } from '@/modules/ticket/application/assignment-options';
import { getReassignmentCapability } from '@/modules/ticket/application/reassignment-options';
import { canReassignSuperintendent } from '@/modules/ticket/application/superintendent-options';
import { getFieldActions } from '@/modules/ticket/application/field-actions';
import { getSurveyCancelActions } from '@/modules/ticket/application/survey-cancel-actions';
import { getPriorityActions } from '@/modules/ticket/application/priority-actions';
import { getCadSummary } from '@/modules/ticket/application/cad-summary';
import { CadSummaryRepository } from '@/modules/ticket/infrastructure/cad-summary.repository';
import { getTicketLabels } from '@/modules/tenancy/application/ticket-labels';
import { TicketLabelsRepository } from '@/modules/tenancy/infrastructure/ticket-labels.repository';
import { recordApproverTimeoutSignals } from
  '@/modules/ticket/infrastructure/timeout-signal.repository';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const { ticketId } = await params;
    const ctx  = await getTicketReadContext(req, ticketId);
    const repo = new TicketRepository();

    const ticket = await repo.findById(pool, ctx.tenantId, ctx.ticketId, ctx.visibility);
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`);
    const labels = await getTicketLabels(new TicketLabelsRepository(), pool, {
      tenantId: ctx.tenantId, projectId: ticket.projectId,
      aorNodeId: ticket.aorNodeId, departmentId: ticket.departmentId,
      partyChiefId: ticket.assignedPartyChiefId, instrumentManId: ticket.assignedInstrumentManId,
      superintendentId: ticket.surveySuperintendentId,
    });
    if (ticket.status === 'SUBMITTED') {
      await recordApproverTimeoutSignals(pool, ctx.tenantId, [ticket.id]);
    }

    const requesterActions = await getRequesterActions(repo, pool, ticket, ctx.visibility);
    const reviewActions = await getReviewActions(repo, pool, ticket, ctx.visibility);
    const assignment = await getAssignmentCapability(repo, pool, ticket, ctx.visibility);
    const reassignment = await getReassignmentCapability(repo, pool, ticket, ctx.visibility);
    const superintendentReassignment = await canReassignSuperintendent(repo, pool, ticket, ctx.visibility);
    const fieldActions = await getFieldActions(repo, pool, ticket, ctx.visibility);
    const surveyCancelActions = await getSurveyCancelActions(repo, pool, ticket, ctx.visibility);
    const priorityActions = await getPriorityActions(repo, pool, ticket, ctx.visibility);
    const cad = await getCadSummary(repo, new CadSummaryRepository(), pool, {
      tenantId: ctx.tenantId, ticketId: ctx.ticketId, actor: ctx.visibility,
    });
    return NextResponse.json({ ticket: { ...ticket, ...labels, requesterActions, reviewActions, assignment, reassignment, superintendentReassignment, fieldActions, surveyCancelActions, priorityActions,
      cad, displayStatus: statusLabel(ticket.status) } });
  } catch (err) {
    return errorResponse(err);
  }
}
