import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { errorResponse } from '@/lib/api-error';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { assertAccessAdministrator } from '@/lib/access-administrator';
import { withTransaction } from '@/lib/with-transaction';
import { CompanyAccessRepository } from '@/modules/identity/infrastructure/company-access.repository';
import type { UUID } from '@/shared/types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    requireResourceUuid(projectId, 'projectId');
    const key = req.headers.has('idempotency-key') ? requireIdempotencyKey(req) : null;
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body.companyId !== 'string' || typeof body.email !== 'string') {
      throw new ValidationError('companyId and email are required');
    }
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('A valid email is required');
    }
    const companyId = body.companyId.trim() as UUID;
    requireResourceUuid(companyId, 'companyId');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const repo = new CompanyAccessRepository();
    const result = await withTransaction(async (db) => {
      await coordinateAuthenticatedMutation(db, req, auth, 'EXCLUSIVE', requireAuth);
      await assertAccessAdministrator(db, auth, projectId as UUID);
      const project = (await db.query<{ status: string }>('SELECT status FROM projects WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [auth.tenantId, projectId])).rows[0];
      if (!project) throw new NotFoundError('Project not found');
      if (project.status === 'ARCHIVED') throw new ConflictError('Archived projects are read-only');
      const mutate = async () => {
      const invite = await repo.createRequesterInvite(db, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        companyId,
        email,
        invitedBy: auth.userId,
        expiresAt,
      });
      if (!invite) throw new ValidationError('Company must be a subcontractor in this project tenant');
      await appendAdministrativeEvent(db, {
        auth, projectId: projectId as UUID, subjectUserId: null,
        eventType: 'user.invited', authorityEvidence: { capability: 'ACCESS_ADMINISTRATOR' },
        changes: { companyId, email, role: 'REQUESTER', expiresAt },
      });
      return { status: 201, body: { inviteToken: invite.token } };
      };
      return key ? executeIdempotentHttpMutation(db, {
        tenantId: auth.tenantId, actorId: auth.userId,
        endpoint: `POST /api/projects/${projectId}/invites`, idempotencyKey: key,
      }, { companyId, email }, mutate) : mutate();
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}
