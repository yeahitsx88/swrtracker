import type { NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { getProjectRole } from '@/lib/get-project-role';
import { pool } from '@/lib/db';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { ForbiddenError } from '@/shared/errors';
import type { InboxActor } from '@/modules/notification/application/project-inbox';
import type { UUID } from '@/shared/types';

/** Any active project member with an operational role reads their own notices. */
export async function inboxActor(req: NextRequest, projectId: string): Promise<InboxActor & { sessionVersion: number }> {
  requireResourceUuid(projectId, 'projectId');
  const auth = await requireActiveAuth(req);
  const actorRole = await getProjectRole(pool, auth.tenantId, projectId as UUID, auth.userId, auth.sessionVersion);
  if (actorRole === 'PROJECT_ADMIN') throw new ForbiddenError('Notifications follow your project work role.');
  return { tenantId: auth.tenantId, projectId: projectId as UUID, actorId: auth.userId, actorRole, sessionVersion: auth.sessionVersion };
}
