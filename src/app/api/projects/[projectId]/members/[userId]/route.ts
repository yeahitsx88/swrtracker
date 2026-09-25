import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectConfigRole } from '@/lib/get-project-config-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { changeProjectMembership } from
  '@/modules/identity/application/user-lifecycle';
import { UserLifecycleRepository } from
  '@/modules/identity/infrastructure/user-lifecycle.repository';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { ProjectRole } from '@/modules/identity/domain/types';

export const dynamic = 'force-dynamic';

const VALID_ROLES: ProjectRole[] = [
  'PROJECT_ADMIN', 'REQUESTER', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT',
  'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD', 'VIEWER',
  'AREA_VIEWER', 'DEPARTMENT_MANAGER', 'DEPARTMENT_LEAD',
  'SUBCONTRACTS_COORDINATOR',
];

async function modify(req: NextRequest, params: Promise<{
  projectId: string; userId: string;
}>, newRole: string | null) {
  const auth = await requireAuth(req);
  const ids = await params;
  const projectId = parseUuid(ids.projectId, 'projectId');
  const userId = parseUuid(ids.userId, 'userId');
  const actorRole = await getProjectConfigRole(pool, auth.tenantId,
    projectId, auth.userId);
  const result = await withTransaction(db => changeProjectMembership(
    new UserLifecycleRepository(), new TenancyRepository(), db, {
      tenantId: auth.tenantId, projectId, userId,
      actorId: auth.userId, actorRole, newRole,
    }));
  if (result.blockedProjects?.length) {
    throw new ForbiddenError(`Survey Manager replacement required for: ${
      result.blockedProjects.map(project => project.name).join(', ')}`);
  }
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest,
  { params }: { params: Promise<{ projectId: string; userId: string }> }) {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        typeof (body as Record<string, unknown>).role !== 'string' ||
        !VALID_ROLES.includes((body as Record<string, unknown>).role as ProjectRole)) {
      throw new ValidationError('Valid project role required');
    }
    return await modify(req, params, (body as { role: string }).role);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest,
  { params }: { params: Promise<{ projectId: string; userId: string }> }) {
  try {
    return await modify(req, params, null);
  } catch (error) {
    return errorResponse(error);
  }
}
