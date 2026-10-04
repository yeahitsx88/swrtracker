import {observeProjectRoute} from '@/lib/observe-project-route';
import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { getProjectRole } from '@/lib/get-project-role';
import { resolveVisibility } from '@/lib/resolve-visibility';
import { parseReviewQuery } from '@/lib/review-query';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { reviewTickets } from '@/modules/ticket/application/review-tickets';
import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';
async function observedGET(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await context.params;
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(projectId)) throw new ValidationError('Invalid project');
    const options = parseReviewQuery(req.nextUrl.searchParams);
    const role = await getProjectRole(pool, auth.tenantId, projectId as UUID, auth.userId, auth.sessionVersion);
    const visibility = await resolveVisibility(pool, auth.tenantId, projectId as UUID, auth.userId, role);
    const result = await reviewTickets(new TicketRepository(), pool, auth.tenantId, { ...options, projectId: projectId as UUID, visibility });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}

export const GET=observeProjectRoute(observedGET);
