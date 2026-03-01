/**
 * POST /api/projects/[projectId]/areas
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { createArea } from '@/modules/tenancy/application/create-area';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).name !== 'string' ||
        typeof (body as Record<string, unknown>).code !== 'string') {
      throw new ValidationError('name and code are required');
    }

    const { name, code } = body as { name: string; code: string };
    const repo = new TenancyRepository();
    const area = await createArea(repo, pool, {
      tenantId:  auth.tenantId,
      projectId: projectId as UUID,
      name,
      code,
    });
    return NextResponse.json({ area }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
