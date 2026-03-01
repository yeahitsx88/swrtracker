/**
 * POST /api/projects/[projectId]/areas/[areaId]/subareas
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { createSubarea } from '@/modules/tenancy/application/create-subarea';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; areaId: string }> },
) {
  try {
    const auth = requireAuth(req);
    const { projectId, areaId } = await params;
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).name !== 'string') {
      throw new ValidationError('name is required');
    }

    const { name } = body as { name: string };
    const repo = new TenancyRepository();
    const subarea = await createSubarea(repo, pool, {
      tenantId:  auth.tenantId,
      projectId: projectId as UUID,
      areaId:    areaId    as UUID,
      name,
    });
    return NextResponse.json({ subarea }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
