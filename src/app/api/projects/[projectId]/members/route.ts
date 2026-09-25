/**
 * POST /api/projects/[projectId]/members
 * Adds a user to a project. PROJECT_ADMIN may do this during SETUP.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { parseUuid } from '@/lib/parse-uuid';
import { getProjectConfigRole } from '@/lib/get-project-config-role';
import { withTransaction } from '@/lib/with-transaction';
import { addProjectMember } from '@/modules/tenancy/application/add-project-member';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { ProjectRole } from '@/modules/identity/domain/types';

export const dynamic = 'force-dynamic';

const VALID_ROLES: ProjectRole[] = [
  'PROJECT_ADMIN', 'REQUESTER', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT',
  'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD', 'VIEWER',
  'AREA_VIEWER', 'DEPARTMENT_MANAGER', 'DEPARTMENT_LEAD',
  'SUBCONTRACTS_COORDINATOR',
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).userId !== 'string' ||
        typeof (body as Record<string, unknown>).role   !== 'string' ||
        !VALID_ROLES.includes((body as Record<string, unknown>).role as ProjectRole)) {
      throw new ValidationError(`userId and role (${VALID_ROLES.join('|')}) are required`);
    }

    const { userId, role } = body as { userId: string; role: ProjectRole };
    const parsedProjectId = parseUuid(projectId, 'projectId');
    const actorRole = await getProjectConfigRole(pool, auth.tenantId,
      parsedProjectId, auth.userId);
    const repo = new TenancyRepository();
    await withTransaction(db => addProjectMember(repo, db, {
      tenantId:  auth.tenantId,
      projectId: parsedProjectId,
      userId:    parseUuid(userId, 'userId'),
      role,
      actorRole,
    }));
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
