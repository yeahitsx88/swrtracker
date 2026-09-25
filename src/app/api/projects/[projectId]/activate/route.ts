import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectConfigRole } from '@/lib/get-project-config-role';
import { parseUuid } from '@/lib/parse-uuid';
import { withTransaction } from '@/lib/with-transaction';
import { activateProject, inspectProjectReadiness } from '@/modules/tenancy/application/activate-project';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

async function context(req: NextRequest, projectId: string) {
  const auth = await requireAuth(req);
  const parsedProjectId = parseUuid(projectId, 'projectId');
  const actorRole = await getProjectConfigRole(
    pool, auth.tenantId, parsedProjectId, auth.userId,
  );
  return { tenantId: auth.tenantId, projectId: parsedProjectId,
    actorId: auth.userId, actorRole };
}

export async function GET(
  req: NextRequest, { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const ctx = await context(req, (await params).projectId);
    const readiness = await inspectProjectReadiness(new TenancyRepository(), pool, ctx);
    return NextResponse.json({ readiness });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  req: NextRequest, { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const ctx = await context(req, (await params).projectId);
    const body = await req.json() as unknown;
    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).acknowledgeWarnings !== 'boolean') {
      throw new ValidationError('acknowledgeWarnings must be a boolean');
    }
    const acknowledgeWarnings = (body as { acknowledgeWarnings: boolean }).acknowledgeWarnings;
    const readiness = await withTransaction((client) => activateProject(
      new TenancyRepository(), client, { ...ctx, acknowledgeWarnings },
    ));
    return NextResponse.json({ status: 'ACTIVE', readiness });
  } catch (error) {
    return errorResponse(error);
  }
}
