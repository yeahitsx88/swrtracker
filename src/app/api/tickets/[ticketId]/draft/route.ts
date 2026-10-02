import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { withTransaction } from '@/lib/with-transaction';
import { requireIdempotencyKey, executeIdempotentHttpMutation } from '@/lib/idempotency';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { pool } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { lockDraftActor } from '@/modules/ticket/application/draft-access';
import { deleteDraft } from '@/modules/ticket/application/delete-draft';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    const auth = await requireActiveAuth(req);
    const { ticketId } = await params;
    requireResourceUuid(ticketId, 'ticketId');
    const key = requireIdempotencyKey(req);
    const body = await req.json() as { expectedVersion?: unknown };
    if (!body || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 0) {
      throw new ValidationError('expectedVersion is required');
    }
    // Owner-only lookup permits safe replay after deletion without exposing coworkers.
    const lookup = await pool.query<{ project_id: UUID }>(
      'SELECT project_id FROM tickets WHERE tenant_id = $1 AND id = $2 AND requester_id = $3',
      [auth.tenantId, ticketId, auth.userId]);
    if (!lookup.rows[0]) throw new NotFoundError('Draft not found');
    const scope = { tenantId: auth.tenantId, projectId: lookup.rows[0].project_id,
      actorId: auth.userId, ticketId: ticketId as UUID, sessionVersion: auth.sessionVersion,
      expectedVersion: body.expectedVersion as number };
    const result = await withTransaction(async db => {
      await coordinateAuthenticatedMutation(db, req, auth, 'SHARED', requireActiveAuth);
      await lockDraftActor(db, scope, 'REQUESTER');
      return executeIdempotentHttpMutation(db, { tenantId: scope.tenantId, actorId: scope.actorId,
        endpoint: `DELETE:/api/tickets/${ticketId}/draft`, idempotencyKey: key }, body,
        async () => { await deleteDraft(db, scope); return { status: 200, body: { deleted: true } }; });
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) { return errorResponse(error); }
}
