import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { ValidationError } from '@/shared/errors';
import { readProjectInbox } from '@/modules/notification/application/project-inbox';
import { inboxActor } from './shared';

export const dynamic = 'force-dynamic';

/** GET — your notices in this project, newest first, with an unread count. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const actor = await inboxActor(req, projectId);
    const raw = req.nextUrl.searchParams.get('offset') ?? '0';
    if (!/^\d+$/.test(raw)) throw new ValidationError('Choose a valid notifications page.');
    return NextResponse.json(await readProjectInbox(pool, actor, Number(raw)), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
