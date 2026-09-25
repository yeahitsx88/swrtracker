import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { getProjectConfigRole } from '@/lib/get-project-config-role';
import { parseUuid } from '@/lib/parse-uuid';
import { getProjectContinuityHealth } from '@/modules/tenancy/application/continuity-health';
import { ContinuityHealthRepository } from '@/modules/tenancy/infrastructure/continuity-health.repository';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireAuth(req);
    const projectId = parseUuid((await params).projectId, 'projectId');
    const actorRole = await getProjectConfigRole(pool,
      auth.tenantId, projectId, auth.userId);
    const health = await getProjectContinuityHealth(
      new TenancyRepository(), new ContinuityHealthRepository(), pool,
      { tenantId: auth.tenantId, projectId, actorRole });
    return NextResponse.json(health);
  } catch (error) { return errorResponse(error); }
}
