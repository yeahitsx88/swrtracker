import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectConfigRole } from '@/lib/get-project-config-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { createAorLevel } from '@/modules/tenancy/application/create-aor-level';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest, { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const projectId = parseUuid((await params).projectId, 'projectId');
    const body = await req.json() as unknown;
    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).depth !== 'number' ||
        typeof (body as Record<string, unknown>).label !== 'string') {
      throw new ValidationError('depth and label are required');
    }
    const { depth, label } = body as { depth: number; label: string };
    const actorRole = await getProjectConfigRole(pool, auth.tenantId, projectId, auth.userId);
    const level = await withTransaction((client) => createAorLevel(
      new TenancyRepository(), client,
      { tenantId: auth.tenantId, projectId, actorId: auth.userId, actorRole,
        depth, label },
    ));
    return NextResponse.json({ level }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
