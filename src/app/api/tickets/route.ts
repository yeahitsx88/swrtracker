/**
 * POST /api/tickets -- create a ticket
 * GET  /api/tickets?projectId=...&limit=...&offset=... -- list tickets (paginated)
 *
 * No raw pool.query() calls -- all DB access via repository methods.
 * Visibility scoping enforced via resolveVisibility (CLAUDE.md Section 7A).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { withTransaction } from '@/lib/with-transaction';
import { pool } from '@/lib/db';
import { getProjectRole } from '@/lib/get-project-role';
import { resolveVisibility } from '@/lib/resolve-visibility';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import { createDirectAssignmentTicket } from '@/modules/ticket/application/create-direct-assignment-ticket';
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
      typeof b.projectId !== 'string' ||
      typeof b.aorNodeId !== 'string' ||
      typeof b.ticketType !== 'string' ||
      typeof b.craft !== 'string' ||
      typeof b.description !== 'string' ||
      typeof b.requestedDate !== 'string' ||
      (b.workflowVariant !== undefined && (
        typeof b.workflowVariant !== 'string' ||
        !VALID_VARIANTS.includes(b.workflowVariant as WorkflowVariant)
      )) ||
      !VALID_TYPES.includes(b.ticketType as TicketType)
    ) {
      throw new ValidationError(
        'projectId, aorNodeId, ticketType, craft, description, requestedDate are required',
      );
    }

    const {
      projectId,
      aorNodeId,
      workflowVariant,
      requesterId,
      assignedPartyChiefId,
      assignedInstrumentManId,
      departmentId,
      ticketType,
      craft,
      description,
      requestedDate,
    } = b as {
      projectId: string;
      aorNodeId: string;
      workflowVariant?: WorkflowVariant;
      requesterId?: string;
      assignedPartyChiefId?: string;
      assignedInstrumentManId?: string;
      departmentId?: string;
      ticketType: TicketType;
      craft: string;
      description: string;
      requestedDate: string;
    };

    const parsedDate = new Date(requestedDate);
    if (isNaN(parsedDate.getTime())) {
      throw new ValidationError('requestedDate is not a valid ISO date');
    }

    const ticketRepo = new TicketRepository();
    const actorRole = await getProjectRole(pool, auth.tenantId, projectId as UUID, auth.userId);
    const projectStatus = await ticketRepo.findProjectStatus(pool, auth.tenantId, projectId as UUID);
    if (!projectStatus) {
      throw new NotFoundError('Project not found');
    }

    if ((workflowVariant ?? 'STANDARD_APPROVAL') === 'DIRECT_ASSIGNMENT') {
      if (actorRole !== 'SURVEY_MANAGER' && actorRole !== 'SURVEY_SUPERINTENDENT') {
        throw new ForbiddenError('Only SURVEY_MANAGER or SURVEY_SUPERINTENDENT may create direct-assignment tickets');
      }
      if (projectStatus !== 'ACTIVE') {
        if (projectStatus === 'SETUP') {
          throw new ConflictError('Tickets cannot be submitted while the project is in SETUP');
        }
        throw new ConflictError('Archived projects are read-only');
      }
      if (typeof requesterId !== 'string') {
        throw new ValidationError('requesterId is required for direct-assignment tickets');
      }
      if (typeof assignedPartyChiefId !== 'string') {
        throw new ValidationError('assignedPartyChiefId is required for direct-assignment tickets');
      }

      const directTicket = await withTransaction((client) =>
        createDirectAssignmentTicket(ticketRepo, client, {
          tenantId: auth.tenantId,
          projectId: projectId as UUID,
          aorNodeId: aorNodeId as UUID,
          requesterId: requesterId as UUID,
          actorId: auth.userId,
          actorRole,
          assignedPartyChiefId: assignedPartyChiefId as UUID,
          assignedInstrumentManId: typeof assignedInstrumentManId === 'string'
            ? assignedInstrumentManId as UUID
            : null,
          departmentId: typeof departmentId === 'string' ? departmentId as UUID : undefined,
          ticketType,
          craft,
          description,
          requestedDate: parsedDate,
        }),
      );

      return NextResponse.json({ ticket: directTicket }, { status: 201 });
    }

    if (actorRole !== 'REQUESTER') {
      throw new ForbiddenError('Only REQUESTER may create tickets');
    }

    if (projectStatus === 'ARCHIVED') {
      throw new ConflictError('Archived projects are read-only');
    }

    const companyInfo = await ticketRepo.findUserCompanyInfo(pool, auth.tenantId, auth.userId);
    if (!companyInfo) {
      throw new ForbiddenError('Authenticated user is missing company context');
    }

    const membership = await ticketRepo.findRequesterDepartmentMembership(
      pool,
      auth.tenantId,
      projectId as UUID,
      auth.userId,
    );
    const resolvedDepartmentId = membership
      ? membership.departmentId
      : typeof departmentId === 'string'
        ? departmentId as UUID
        : null;

    if (resolvedDepartmentId) {
      const department = await ticketRepo.findDepartmentById(
        pool,
        auth.tenantId,
        projectId as UUID,
        resolvedDepartmentId,
      );
      if (!department) {
        throw new ValidationError('departmentId must reference a department in this project');
      }

      const ticket = await withTransaction((client) =>
        createTicket(ticketRepo, client, {
          tenantId: auth.tenantId,
          projectId: projectId as UUID,
          aorNodeId: aorNodeId as UUID,
          departmentId: department.id,
          companyId: companyInfo.companyId,
          requesterId: auth.userId,
          ticketType,
          workflowVariant: 'STANDARD_APPROVAL' as WorkflowVariant,
          craft,
          description,
          requestedDate: parsedDate,
        }),
      );

      return NextResponse.json({ ticket }, { status: 201 });
    }

    const ticket = await withTransaction((client) =>
      createTicket(ticketRepo, client, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        aorNodeId: aorNodeId as UUID,
        companyId: companyInfo.companyId,
        requesterId: auth.userId,
        ticketType,
        workflowVariant: 'STANDARD_APPROVAL' as WorkflowVariant,
        craft,
        description,
        requestedDate: parsedDate,
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

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

    const actorRole = await getProjectRole(pool, auth.tenantId, projectId as UUID, auth.userId);
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
