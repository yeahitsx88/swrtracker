import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { resolveProjectInsightRole } from '@/lib/project-insight-auth';
import { withTransaction } from '@/lib/with-transaction';
import {
  captureQueuedNotifications,
  listLocalNotificationPreviews,
  retryFailedNotifications,
} from '@/modules/notification/application/local-preview';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    const projectUuid = projectId as UUID;
    const actorRole = await resolveProjectInsightRole(auth, projectUuid);
    const messages = await listLocalNotificationPreviews(pool, {
      tenantId: auth.tenantId, projectId: projectUuid, actorId: auth.userId, actorRole,
    });
    return NextResponse.json({ messages });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = requireAuth(req);
    const { projectId } = await params;
    const projectUuid = projectId as UUID;
    const body = await req.json() as Record<string, unknown>;
    if (body.action !== 'capture' && body.action !== 'retry-failed') {
      throw new ValidationError('action must be capture or retry-failed');
    }
    const actorRole = await resolveProjectInsightRole(auth, projectUuid);
    const updatedCount = await withTransaction((db) => body.action === 'capture'
      ? captureQueuedNotifications(db, { tenantId: auth.tenantId, projectId: projectUuid, actorRole })
      : retryFailedNotifications(db, { tenantId: auth.tenantId, projectId: projectUuid, actorRole }));
    return NextResponse.json({ updatedCount });
  } catch (error) {
    return errorResponse(error);
  }
}
