import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { assertOperationsViewer, resolveProjectInsightRole } from '@/lib/project-insight-auth';
import { getAmeliaMetrics } from '@/modules/reporting/application/amelia-metrics';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    const projectUuid = projectId as UUID;
    const role = await resolveProjectInsightRole(auth, projectUuid);
    assertOperationsViewer(role);
    return NextResponse.json({ metrics: await getAmeliaMetrics(pool, { tenantId: auth.tenantId, projectId: projectUuid }) });
  } catch (error) {
    return errorResponse(error);
  }
}
