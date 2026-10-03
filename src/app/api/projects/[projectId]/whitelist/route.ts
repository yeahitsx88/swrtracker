import { administrationRetry } from '@/lib/administration-retry';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { withTransaction } from '@/lib/with-transaction';
/**
 * POST   /api/projects/[projectId]/whitelist — add email to priority whitelist
 * DELETE /api/projects/[projectId]/whitelist — remove email from priority whitelist
 * Both require TENANT_ADMIN.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireActiveAuth as requireAuth } from '@/lib/auth';

import { addToWhitelist, removeFromWhitelist } from '@/modules/tenancy/application/whitelist';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import type { UUID } from '@/shared/types';
import { assertProjectAdministrator } from '@/lib/project-capabilities';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).email !== 'string') {
      throw new ValidationError('email is required');
    }

    const { email } = body as { email: string };
    const entry = await withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', requireAuth);
      const actorRole = (await assertProjectAdministrator(client,auth,projectId as UUID)).centralIT?'TENANT_ADMIN':'PROJECT_ADMIN';
      const resolvedActorRole = actorRole;
      const repo = new TenancyRepository();
      return administrationRetry(client,req,auth,`POST /api/projects/${projectId}/whitelist`,{email},201,async()=>{
      const entry = await addToWhitelist(repo, client, {
      tenantId:  auth.tenantId,
      projectId: projectId as UUID,
      email,
      addedBy:   auth.userId,
      actorRole: resolvedActorRole,
    });
      await appendAdministrativeEvent(client, {
        auth, projectId: projectId as UUID, subjectUserId: null,
        eventType: 'project.configuration_changed', authorityEvidence: { actorRole },
        changes: { resource: 'PRIORITY_WHITELIST', action: 'ADDED', email },
      });
      return entry;
      });
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as unknown;

    if (!body || typeof body !== 'object' ||
        typeof (body as Record<string, unknown>).email !== 'string') {
      throw new ValidationError('email is required');
    }

    const { email } = body as { email: string };
    await withTransaction(async (client) => {
      await coordinateAuthenticatedMutation(client, req, auth, 'EXCLUSIVE', requireAuth);
      const actorRole = (await assertProjectAdministrator(client,auth,projectId as UUID)).centralIT?'TENANT_ADMIN':'PROJECT_ADMIN';
      const resolvedActorRole = actorRole;
      const repo = new TenancyRepository();
      return administrationRetry(client,req,auth,`DELETE /api/projects/${projectId}/whitelist`,{email},200,async()=>{
      await removeFromWhitelist(repo, client, {
      tenantId:  auth.tenantId,
      projectId: projectId as UUID,
      email,
      actorRole: resolvedActorRole,
    });
      await appendAdministrativeEvent(client, {
        auth, projectId: projectId as UUID, subjectUserId: null,
        eventType: 'project.configuration_changed', authorityEvidence: { actorRole },
        changes: { resource: 'PRIORITY_WHITELIST', action: 'REMOVED', email },
      });
      return {success:true};
      });
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
