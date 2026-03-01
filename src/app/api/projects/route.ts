/**
 * POST /api/projects
 * Creates a project within the authenticated user's tenant.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getTenantRole } from '@/lib/get-tenant-role';
import { createProject } from '@/modules/tenancy/application/create-project';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).name !== 'string') {
      throw new ValidationError('name is required');
    }

    const { name } = body as { name: string };
    const actorRole = await getTenantRole(pool, auth.tenantId, auth.userId);
    const repo = new TenancyRepository();
    const project = await createProject(repo, pool, {
      tenantId: auth.tenantId as UUID,
      name,
      actorRole,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
