/**
 * POST /api/projects/[projectId]/members
 * Adds a user to a project. Requires TENANT_ADMIN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectRole } from '@/lib/get-project-role';
import { addProjectMember } from '@/modules/tenancy/application/add-project-member';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

const VALID_ROLES: ProjectRole[] = [
  'REQUESTER', 'APPROVER', 'SURVEY_LEAD',
  'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD', 'VIEWER',
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).userId !== 'string' ||
        typeof (body as Record<string, unknown>).role   !== 'string' ||
        !VALID_ROLES.includes((body as Record<string, unknown>).role as ProjectRole)) {
      throw new ValidationError(`userId and role (${VALID_ROLES.join('|')}) are required`);
    }

    const { userId, role } = body as { userId: string; role: ProjectRole };
    const actorRole = await getProjectRole(pool, auth.tenantId, projectId as UUID, auth.userId);
    const repo = new TenancyRepository();
    await addProjectMember(repo, pool, {
      tenantId:  auth.tenantId,
      projectId: projectId as UUID,
      userId:    userId    as UUID,
      role,
      actorRole,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
