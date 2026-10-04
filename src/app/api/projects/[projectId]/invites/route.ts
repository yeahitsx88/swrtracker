import {administrationRetry} from '@/lib/administration-retry';
import {assertRecommissioningMutation} from '@/lib/recommissioning-gate';
import { appendAdministrativeEvent } from '@/modules/audit/infrastructure/administrative-event.repository';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError,ValidationError } from '@/shared/errors';
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
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body.companyId !== 'string' || typeof body.email !== 'string') {
      throw new ValidationError('companyId and email are required');
    }
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('A valid email is required');
    }
    const companyId = body.companyId.trim() as UUID;
    if (!companyId) throw new ValidationError('companyId is required');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const repo = new CompanyAccessRepository();
    const result = await withTransaction(async (db) => {
      await coordinateAuthenticatedMutation(db, req, auth, 'EXCLUSIVE', requireAuth);
      await assertAccessAdministrator(db, auth, projectId as UUID);
      await assertRecommissioningMutation(db,auth.tenantId,projectId as UUID);
      const project=(await db.query('SELECT status FROM projects WHERE tenant_id=$1 AND id=$2',[auth.tenantId,projectId])).rows[0];
      if(!project||project.status==='ARCHIVED')throw new ValidationError('Invitations require a writable project');
      // The ledger stores only the record ID, never an invitation bearer token.
      const recorded=await administrationRetry(db,req,auth,`POST /api/projects/${projectId}/invites`,{companyId,email},201,async()=>{
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
      const row=(await db.query('SELECT id FROM invites WHERE tenant_id=$1 AND project_id=$2 AND token=$3',[auth.tenantId,projectId,invite.token])).rows[0];
      if(!row)throw new ValidationError('Invitation record unavailable');
      return {inviteId:row.id as string};
      });
      const current=(await db.query('SELECT token FROM invites WHERE id=$1 AND tenant_id=$2 AND project_id=$3 AND invited_by=$4 AND accepted_at IS NULL AND expires_at>now()',[recorded.inviteId,auth.tenantId,projectId,auth.userId])).rows[0];
      if(!current)throw new ConflictError('The recorded invitation is no longer pending. Reload invitations before creating another.');
      return current;
    });
    return NextResponse.json({ inviteToken: result.token }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
