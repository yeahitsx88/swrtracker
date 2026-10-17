import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { withTransaction } from '@/lib/with-transaction';
import { getProjectRole } from '@/lib/get-project-role';
import { markNoticesSeen } from '@/modules/notification/application/project-inbox';
import { inboxActor } from '../shared';

export const dynamic = 'force-dynamic';

/** POST — mark your notices in this project as seen up to now (idempotent; never moves back). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const actor = await inboxActor(req, projectId);
    const result = await withTransaction(db => markNoticesSeen(db, actor), {
      req, auth: { tenantId: actor.tenantId, userId: actor.actorId, sessionVersion: actor.sessionVersion }, mode: 'SHARED',
      authorize: async (db, current) => { await getProjectRole(db, current.tenantId, actor.projectId, current.userId, current.sessionVersion); },
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
