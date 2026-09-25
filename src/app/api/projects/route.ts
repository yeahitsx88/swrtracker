/**
 * POST /api/projects
 * Creates a project within the authenticated user's tenant.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { requireTenantAdmin } from '@/lib/get-tenant-role';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import { parseUuid } from '@/lib/parse-uuid';
import { createProject } from '@/modules/tenancy/application/create-project';
import { createProjectFromTemplate } from '@/modules/tenancy/application/project-templates';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).name !== 'string') {
      throw new ValidationError('name is required');
    }

    const { name } = body as { name: string };
    const actorRole = await requireTenantAdmin(pool, auth.tenantId, auth.userId);
    const repo = new TenancyRepository();
    const input = body as Record<string, unknown>;
    if (input.templateId !== undefined) {
      if (typeof input.templateId !== 'string') {
        throw new ValidationError('templateId must be a UUID');
      }
      if (input.crewBuild !== undefined) {
        throw new ValidationError('crewBuild comes from the selected template');
      }
      const project = await withTransaction(db => createProjectFromTemplate(repo, db, {
        tenantId: auth.tenantId, actorId: auth.userId, actorRole, name,
        templateId: parseUuid(input.templateId as string, 'templateId'),
      }));
      return NextResponse.json({ project }, { status: 201 });
    }
    const crewBuild = input.crewBuild;
    if (crewBuild !== 'FULL' && crewBuild !== 'MEDIUM' && crewBuild !== 'SLIM') {
      throw new ValidationError('crewBuild must be FULL, MEDIUM, or SLIM');
    }
    const project = await createProject(repo, pool, {
      tenantId: auth.tenantId, name, crewBuild, actorRole,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
