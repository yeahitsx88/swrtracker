/**
 * POST /api/tickets — create a ticket
 * GET  /api/tickets?projectId=...&limit=...&offset=... — list tickets (paginated)
 *
 * No raw pool.query() calls — all DB access via repository methods.
 * Visibility scoping enforced via resolveVisibility (CLAUDE.md §7A).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { withTransaction } from '@/lib/with-transaction';
import { pool } from '@/lib/db';
import { getProjectWorkflowRole } from '@/lib/get-project-workflow-role';
import { getTenantRole } from '@/lib/get-tenant-role';
import { parseUuid } from '@/lib/parse-uuid';
import { resolveVisibility } from '@/lib/resolve-visibility';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import { canViewHelpBoard } from '@/modules/ticket/application/help-board';
import { canCreateRequest } from '@/modules/ticket/application/requester-actions';
import type { WorkflowVariant } from '@/modules/workflow/domain/transitions';
import type { TicketType } from '@/modules/ticket/domain/types';
import { statusLabel } from '@/modules/ticket/domain/status-label';
import { recordApproverTimeoutSignals } from
  '@/modules/ticket/infrastructure/timeout-signal.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

const VALID_VARIANTS: WorkflowVariant[] = ['STANDARD_APPROVAL', 'DIRECT_ASSIGNMENT'];
const VALID_TYPES: TicketType[] = ['LAYOUT', 'CHECK_OUT', 'AS_BUILT', 'TOPO', 'PERMIT'];

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json() as unknown;
    const b = body as Record<string, unknown>;

    if (
      !body || typeof body !== 'object' ||
      typeof b.projectId       !== 'string' ||
      typeof b.aorNodeId       !== 'string' ||
      typeof b.companyId       !== 'string' ||
      typeof b.ticketType      !== 'string' ||
      typeof b.workflowVariant !== 'string' ||
      typeof b.craft           !== 'string' ||
      typeof b.description     !== 'string' ||
      typeof b.requestedDate   !== 'string' ||
      !VALID_TYPES.includes(b.ticketType as TicketType) ||
      !VALID_VARIANTS.includes(b.workflowVariant as WorkflowVariant)
    ) {
      throw new ValidationError(
        'projectId, aorNodeId, companyId, ticketType, workflowVariant, craft, description, requestedDate are required',
      );
    }

    const {
      projectId, aorNodeId, companyId,
      ticketType, workflowVariant, craft, description, requestedDate,
    } = b as {
      projectId: string; aorNodeId: string; companyId: string;
      ticketType: TicketType; workflowVariant: WorkflowVariant;
      craft: string; description: string; requestedDate: string;
    };
    const projectUuid = parseUuid(projectId, 'projectId');
    const aorNodeUuid = parseUuid(aorNodeId, 'aorNodeId');
    const companyUuid = parseUuid(companyId, 'companyId');
    if (b.departmentId !== undefined && typeof b.departmentId !== 'string') {
      throw new ValidationError('departmentId must be a UUID');
    }
    const departmentUuid = b.departmentId === undefined ? undefined
      : parseUuid(b.departmentId, 'departmentId');

    const parsedDate = new Date(requestedDate);
    if (isNaN(parsedDate.getTime())) {
      throw new ValidationError('requestedDate is not a valid ISO date');
    }

    const ticketRepo  = new TicketRepository();
    const tenancyRepo = new TenancyRepository();

    // Both calls go through repository methods — no raw SQL in the route
    const requesterEmail = await ticketRepo.findUserEmail(pool, auth.tenantId, auth.userId) ?? '';
    const isWhitelisted  = await tenancyRepo.isEmailWhitelisted(
      pool, auth.tenantId, projectUuid, requesterEmail,
    );

    const ticket = await withTransaction((client) =>
      createTicket(ticketRepo, client, {
        tenantId:        auth.tenantId,
        projectId:       projectUuid,
        aorNodeId:       aorNodeUuid,
        companyId:       companyUuid,
        departmentId:    departmentUuid,
        requesterId:     auth.userId,
        requesterEmail,
        ticketType,
        workflowVariant,
        craft,
        description,
        requestedDate:   parsedDate,
        isWhitelisted,
      }),
    );

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) throw new ValidationError('projectId query parameter is required');

    const projectUuid = parseUuid(projectId, 'projectId');
    const limit  = Number(searchParams.get('limit') ?? '50');
    const offset = Number(searchParams.get('offset') ?? '0');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 ||
        !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
      throw new ValidationError('limit must be 1-200 and offset must be 0-100000');
    }

    const tenantRole = await getTenantRole(pool, auth.tenantId, auth.userId);
    const actorRole = tenantRole === 'TENANT_ADMIN'
      ? tenantRole
      : await getProjectWorkflowRole(pool, auth.tenantId, projectUuid, auth.userId);
    const visibility = await resolveVisibility(
      pool, auth.tenantId, projectUuid, auth.userId, actorRole,
    );

    const ticketRepo = new TicketRepository();
    const page = await ticketRepo.list(pool, auth.tenantId, {
      projectId: projectUuid,
      visibility,
      limit,
      offset,
    });
    await recordApproverTimeoutSignals(pool, auth.tenantId,
      page.data.filter(ticket => ticket.status === 'SUBMITTED').map(ticket => ticket.id));

    const canRequest = await canCreateRequest(ticketRepo, pool, auth.tenantId, projectUuid, visibility);
    return NextResponse.json({ ...page, canRequest, canViewHelpFlags: canViewHelpBoard(actorRole), data: page.data.map(ticket => ({
      ...ticket, displayStatus: statusLabel(ticket.status),
    })) });
  } catch (err) {
    return errorResponse(err);
  }
}
