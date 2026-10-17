import {observeProjectRoute} from '@/lib/observe-project-route';
import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
import {NotFoundError} from '@/shared/errors';
import {readProjectCompanyDetails} from '@/modules/tenancy/infrastructure/project-companies.reader';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string;companyId:string}>};
/** Decision 57 / D7: read-only details of a company associated with this project, for its administrators. */
async function observedGET(req:NextRequest,ctx:Context){try{
  const auth=await requireActiveAuth(req),{projectId,companyId}=await ctx.params;
  requireResourceUuid(projectId,'projectId');requireResourceUuid(companyId,'companyId');
  await assertProjectAdministrator(pool,auth,projectId as UUID);
  const details=await readProjectCompanyDetails(pool,auth.tenantId,projectId as UUID,companyId as UUID);
  if(!details)throw new NotFoundError('This company is not associated with this project');
  return NextResponse.json(details,{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return errorResponse(error);}}
export const GET=observeProjectRoute(observedGET);
