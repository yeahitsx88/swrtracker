import {observeProjectRoute} from '@/lib/observe-project-route';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { NextResponse, type NextRequest } from 'next/server';
import { NotFoundError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { assertAccessAdministrator } from '@/lib/access-administrator';
import { withTransaction } from '@/lib/with-transaction';
import { CompanyAccessRepository } from '@/modules/identity/infrastructure/company-access.repository';
import type { UUID } from '@/shared/types';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {requireResourceUuid} from '@/lib/resource-uuid';

export const dynamic = 'force-dynamic';

async function observedDELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; grantId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { projectId, grantId } = await params;
    requireResourceUuid(projectId,'projectId');requireResourceUuid(grantId,'grantId');
    const key=req.headers.has('Idempotency-Key')?requireIdempotencyKey(req):null;
    const repo = new CompanyAccessRepository();
    await withTransaction(async (db) => {
      await coordinateAuthenticatedMutation(db, req, auth, 'EXCLUSIVE', requireAuth);
      await assertAccessAdministrator(db, auth, projectId as UUID);
      const apply=async()=>{
      const grant = await repo.revokeCompanyAuthority(db, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        grantId: grantId as UUID,
        actorId: auth.userId,
      });
      if (!grant) throw new NotFoundError('Active company authority grant not found');
      await repo.appendEvent(db, grant, auth.userId, 'COMPANY_AUTHORITY_REVOKED');
      };
      if(!key)return apply();
      await executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`DELETE /api/projects/${projectId}/company-authority/${grantId}`,idempotencyKey:key},{grantId},async()=>{await apply();return {status:200,body:{success:true}};});
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export const DELETE=observeProjectRoute(observedDELETE);
