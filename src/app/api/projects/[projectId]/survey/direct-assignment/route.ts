import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { getProjectRole } from '@/lib/get-project-role';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { readDirectAssignmentOptions } from '@/modules/ticket/application/direct-assignment-options';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

/** GET — choices for the direct-assignment form (Survey Manager / Superintendent). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    requireResourceUuid(projectId, 'projectId');
    const auth = await requireActiveAuth(req);
    const actorRole = await getProjectRole(pool, auth.tenantId, projectId as UUID, auth.userId, auth.sessionVersion);
    const options = await readDirectAssignmentOptions(pool, { tenantId: auth.tenantId, projectId: projectId as UUID, actorRole });
    return NextResponse.json(options, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
