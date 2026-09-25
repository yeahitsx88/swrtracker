/**
 * POST /api/projects/[projectId]/members
 * Adds a user to a project. Requires TENANT_ADMIN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTenantRole } from '@/lib/get-tenant-role';
import { getProjectRole } from '@/lib/get-project-role';
import { addProjectMember } from '@/modules/tenancy/application/add-project-member';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

const VALID_ROLES: ProjectRole[] = [
  'REQUESTER', 'SURVEY_MANAGER', 'SURVEY_SUPERINTENDENT',
  'PARTY_CHIEF', 'INSTRUMENT_MAN', 'CAD_TECHNICIAN', 'CAD_LEAD', 'VIEWER',
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    const projectUuid = projectId as UUID;
    const tenantRole = await getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion);
    if (tenantRole !== 'TENANT_ADMIN') {
      const projectRole = await getProjectRole(pool, auth.tenantId, projectUuid, auth.userId, auth.sessionVersion);
      if (projectRole !== 'PROJECT_ADMIN' && projectRole !== 'SURVEY_MANAGER') {
        throw new ForbiddenError('Only IT administrators or the Survey Lead may list project members');
      }
    }
    const { rows } = await pool.query<{
      user_id: string; name: string; email: string; role: ProjectRole;
    }>(
      `SELECT pm.user_id, u.name, u.email, pm.role
       FROM project_memberships pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1 AND u.tenant_id = $2 AND u.deactivated_at IS NULL
       ORDER BY pm.role, u.name, u.email`,
      [projectUuid, auth.tenantId],
    );
    return NextResponse.json({
      members: rows.map((row) => ({ userId: row.user_id, name: row.name, email: row.email, role: row.role })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

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
    const actorRole = await getTenantRole(pool, auth.tenantId, auth.userId, auth.sessionVersion);
    const resolvedActorRole = actorRole === 'TENANT_ADMIN' ? 'TENANT_ADMIN' : 'REQUESTER';
    const repo = new TenancyRepository();
    await addProjectMember(repo, pool, {
      tenantId:  auth.tenantId,
      projectId: projectId as UUID,
      userId:    userId    as UUID,
      role,
      actorRole: resolvedActorRole,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
