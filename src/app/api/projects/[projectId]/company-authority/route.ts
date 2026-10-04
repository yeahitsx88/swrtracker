import {observeProjectRoute} from '@/lib/observe-project-route';
import { coordinateAuthenticatedMutation } from '@/lib/tenant-lifecycle-lock';
import { NextResponse, type NextRequest } from 'next/server';
import { ConflictError, ValidationError } from '@/shared/errors';
import { errorResponse } from '@/lib/api-error';
import { requireActiveAuth as requireAuth } from '@/lib/auth';
import { assertAccessAdministrator } from '@/lib/access-administrator';
import { withTransaction } from '@/lib/with-transaction';
import { CompanyAccessRepository } from '@/modules/identity/infrastructure/company-access.repository';
import type { UUID } from '@/shared/types';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {requireResourceUuid} from '@/lib/resource-uuid';

export const dynamic = 'force-dynamic';

async function observedGET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    const repo = new CompanyAccessRepository();
    const overview = await withTransaction(async (db) => {
      await assertAccessAdministrator(db, auth, projectId as UUID);
      return repo.listProjectCompanyAccess(db, auth.tenantId, projectId as UUID);
    });
    return NextResponse.json(overview);
  } catch (err) {
    return errorResponse(err);
  }
}

async function observedPOST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const auth = await requireAuth(req);
    const { projectId } = await params;
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body.userId !== 'string' || !body.userId.trim()) {
      throw new ValidationError('userId is required');
    }
    const repo = new CompanyAccessRepository();
    requireResourceUuid(projectId,'projectId');requireResourceUuid(body.userId,'userId');
    const key=req.headers.has('Idempotency-Key')?requireIdempotencyKey(req):null;
    const grant = await withTransaction(async (db) => {
      await coordinateAuthenticatedMutation(db, req, auth, 'EXCLUSIVE', requireAuth);
      await assertAccessAdministrator(db, auth, projectId as UUID);
      const apply=async()=>{
      const created = await repo.grantCompanyAuthority(db, {
        tenantId: auth.tenantId,
        projectId: projectId as UUID,
        userId: body.userId as UUID,
        actorId: auth.userId,
      });
      if (!created) throw new ConflictError('User is ineligible or already has company authority');
      await repo.appendEvent(db, created, auth.userId, 'COMPANY_AUTHORITY_GRANTED');
      return created;
      };
      if(!key)return apply();
      const result=await executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST /api/projects/${projectId}/company-authority`,idempotencyKey:key},{userId:body.userId},async()=>({status:201,body:{grant:await apply()}}));
      return (result.body as {grant:Awaited<ReturnType<typeof apply>>}).grant;
    });
    return NextResponse.json({ grant }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET=observeProjectRoute(observedGET);
export const POST=observeProjectRoute(observedPOST);
