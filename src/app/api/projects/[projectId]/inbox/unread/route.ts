import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { countUnreadNotices } from '@/modules/notification/application/project-inbox';
import { inboxActor } from '../shared';

export const dynamic = 'force-dynamic';

/** GET — how many of your notices in this project are newer than what you last saw. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const actor = await inboxActor(req, projectId);
    return NextResponse.json({ unread: await countUnreadNotices(pool, actor) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
