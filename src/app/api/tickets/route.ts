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
import { getProjectRole } from '@/lib/get-project-role';
import { resolveVisibility } from '@/lib/resolve-visibility';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import type { WorkflowVariant } from '@/modules/workflow/domain/transitions';
import type { TicketType } from '@/modules/ticket/domain/types';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

const VALID_VARIANTS: WorkflowVariant[] = ['STANDARD_APPROVAL', 'DIRECT_ASSIGNMENT'];
const VALID_TYPES: TicketType[] = ['LAYOUT', 'CHECK_OUT', 'AS_BUILT', 'TOPO', 'PERMIT'];

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    const body = await req.json() as unknown;
    const b = body as Record<string, unknown>;

    if (
      !body || typeof body !== 'object' ||
      typeof b.projectId       !== 'string' ||
      typeof b.areaId          !== 'string' ||
      typeof b.subareaId       !== 'string' ||
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
        'projectId, areaId, subareaId, companyId, ticketType, workflowVariant, craft, description, requestedDate are required',
      );
    }

    const {
      projectId, areaId, subareaId, companyId,
      ticketType, workflowVariant, craft, description, requestedDate,
    } = b as {
      projectId: string; areaId: string; subareaId: string; companyId: string;
      ticketType: TicketType; workflowVariant: WorkflowVariant;
      craft: string; description: string; requestedDate: string;
    };

    const parsedDate = new Date(requestedDate);
    if (isNaN(parsedDate.getTime())) {
      throw new ValidationError('requestedDate is not a valid ISO date');
    }

    const ticketRepo  = new TicketRepository();
    const tenancyRepo = new TenancyRepository();

    // Both calls go through repository methods — no raw SQL in the route
    const requesterEmail = await ticketRepo.findUserEmail(pool, auth.tenantId, auth.userId) ?? '';
    const isWhitelisted  = await tenancyRepo.isEmailWhitelisted(
      pool, auth.tenantId, projectId as UUID, requesterEmail,
    );

    const ticket = await withTransaction((client) =>
      createTicket(ticketRepo, client, {
        tenantId:        auth.tenantId,
        projectId:       projectId  as UUID,
        areaId:          areaId     as UUID,
        subareaId:       subareaId  as UUID,
        companyId:       companyId  as UUID,
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
    const auth = requireAuth(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) throw new ValidationError('projectId query parameter is required');

    const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0',  10), 0);

    const actorRole  = await getProjectRole(pool, auth.tenantId, projectId as UUID, auth.userId);
    const visibility = await resolveVisibility(
      pool, auth.tenantId, projectId as UUID, auth.userId, actorRole,
    );

    const ticketRepo = new TicketRepository();
    const page = await ticketRepo.list(pool, auth.tenantId, {
      projectId: projectId as UUID,
      visibility,
      limit,
      offset,
    });

    return NextResponse.json(page);
  } catch (err) {
    return errorResponse(err);
  }
}