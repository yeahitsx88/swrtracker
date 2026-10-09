import {observeProjectRoute} from '@/lib/observe-project-route';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { withTransaction } from '@/lib/with-transaction';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { lockDraftActor } from '@/modules/ticket/application/draft-access';
import { recoverDraft } from '@/modules/ticket/application/recover-draft';
import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';
async function observedPOST(req: NextRequest, { params }: { params: Promise<{ projectId: string; ticketId: string }> }) {
  try {
    const auth = await requireActiveAuth(req);
    const { projectId, ticketId } = await params;
    requireResourceUuid(projectId, 'projectId'); requireResourceUuid(ticketId, 'ticketId');
    const key = requireIdempotencyKey(req);
    const body = await req.json() as { reason?: unknown; expectedVersion?: unknown };
    if (!body || typeof body.reason !== 'string' || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 0) {
      throw new ValidationError('Recovery reason and expectedVersion are required');
    }
    const scope = { tenantId: auth.tenantId, projectId: projectId as UUID, ticketId: ticketId as UUID,
      actorId: auth.userId, sessionVersion: auth.sessionVersion,
      reason: body.reason, expectedVersion: body.expectedVersion as number };
    const result = await withTransaction(async db => {
      await coordinateAuthenticatedMutation(db, req, auth, 'SHARED', requireActiveAuth);
      await lockDraftActor(db, scope, 'PROJECT_ADMIN');
      return executeIdempotentHttpMutation(db, { tenantId: scope.tenantId, actorId: scope.actorId,
        endpoint: `POST:/api/projects/${projectId}/drafts/${ticketId}/restore`, idempotencyKey: key }, body,
        async () => { await recoverDraft(db, scope); return { status: 200, body: { restored: true } }; });
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) { return errorResponse(error); }
}

export const POST=observeProjectRoute(observedPOST);
