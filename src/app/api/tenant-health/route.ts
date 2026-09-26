import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { pool } from '@/lib/db';
import { errorResponse } from '@/lib/api-error';
import { getTenantHealth } from '@/modules/reporting/application/tenant-health';
import { TenantHealthRepository } from '@/modules/reporting/infrastructure/tenant-health.repository';
import { getProjectContinuityHealth } from '@/modules/tenancy/application/continuity-health';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import { ContinuityHealthRepository } from '@/modules/tenancy/infrastructure/continuity-health.repository';

export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
  try {
    const auth=await requireAuth(req),query=new URL(req.url).searchParams;
    const page=await getTenantHealth(new TenantHealthRepository(),{
      read:(db,tenantId,projectId,now)=>getProjectContinuityHealth(new TenancyRepository(),
        new ContinuityHealthRepository(),db,{tenantId,projectId,actorRole:'TENANT_ADMIN'},now),
    },pool,{...auth,limit:Number(query.get('limit')??'20'),offset:Number(query.get('offset')??'0')});
    return NextResponse.json(page,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error);}
}
