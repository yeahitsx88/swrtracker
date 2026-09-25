import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectConfigRole } from '@/lib/get-project-config-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { assignAorSuperintendent } from '@/modules/tenancy/application/assign-aor-superintendent';
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
        typeof (body as Record<string, unknown>).nodeId !== 'string' ||
        typeof (body as Record<string, unknown>).userId !== 'string') {
      throw new ValidationError('nodeId and userId are required');
    }
    const { nodeId, userId } = body as { nodeId: string; userId: string };
    const actorRole = await getProjectConfigRole(pool, auth.tenantId, projectId, auth.userId);
    await withTransaction((client) => assignAorSuperintendent(
      new TenancyRepository(), client,
      { tenantId: auth.tenantId, projectId, actorId: auth.userId, actorRole,
        nodeId: parseUuid(nodeId, 'nodeId'), userId: parseUuid(userId, 'userId') },
    ));
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
