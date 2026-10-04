import {observeProjectRoute} from '@/lib/observe-project-route';
import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
import {ValidationError} from '@/shared/errors';
import {requireIdempotencyKey,executeIdempotentHttpMutation} from '@/lib/idempotency';
import {registerProjectCompany} from '@/modules/tenancy/application/project-administration';
import type {CompanyType} from '@/modules/tenancy/domain/types';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string}>};
async function observedGET(req:NextRequest,ctx:Context){try{
  const auth=await requireActiveAuth(req),{projectId}=await ctx.params;requireResourceUuid(projectId,'projectId');await assertProjectAdministrator(pool,auth,projectId as UUID);
  const limit=Number(req.nextUrl.searchParams.get('limit')??100),offset=Number(req.nextUrl.searchParams.get('offset')??0);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw new ValidationError('Invalid candidate page');
  const companies=(await pool.query(`SELECT c.id,c.name,c.type FROM project_companies pc JOIN companies c ON c.tenant_id=pc.tenant_id AND c.id=pc.company_id WHERE pc.tenant_id=$1 AND pc.project_id=$2 ORDER BY lower(c.name),c.id`,[auth.tenantId,projectId])).rows;
  const candidates=(await pool.query(`SELECT u.id AS "userId",u.name,u.email,u.company_id AS "companyId",c.name AS "companyName",c.type AS "companyType" FROM users u
    JOIN project_companies pc ON pc.tenant_id=u.tenant_id AND pc.company_id=u.company_id AND pc.project_id=$2 JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id
    WHERE u.tenant_id=$1 AND u.deactivated_at IS NULL AND NOT EXISTS(SELECT 1 FROM project_memberships pm WHERE pm.project_id=$2 AND pm.user_id=u.id)
    ORDER BY lower(u.name),u.id LIMIT $3 OFFSET $4`,[auth.tenantId,projectId,limit,offset])).rows;
  return NextResponse.json({companies,candidates});
}catch(error){return errorResponse(error);}}
async function observedPOST(req:NextRequest,ctx:Context){try{
  const auth=await requireActiveAuth(req),{projectId}=await ctx.params;requireResourceUuid(projectId,'projectId');
  const body=await req.json() as Record<string,unknown>,key=requireIdempotencyKey(req);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(field=>!['companyId','name','type','confirmed'].includes(field))||body.confirmed!==true)throw new ValidationError('Confirm the project company association');
  let input:{companyId:UUID}|{name:string;type:CompanyType};
  if(typeof body.companyId==='string'&&body.name===undefined&&body.type===undefined){requireResourceUuid(body.companyId,'companyId');input={companyId:body.companyId as UUID};}
  else if(body.companyId===undefined&&typeof body.name==='string'&&typeof body.type==='string'&&['GC','SUBCONTRACTOR','OWNER_REP'].includes(body.type))input={name:body.name,type:body.type as CompanyType};
  else throw new ValidationError('Choose an existing company or a new company name and type');
  const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST /api/projects/${projectId}/companies`,idempotencyKey:key},body,
    async()=>({status:200,body:{company:await registerProjectCompany(db,auth,projectId as UUID,input)}})),{req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{await assertProjectAdministrator(db,current,projectId as UUID);}});
  return NextResponse.json(result.body,{status:result.status});
}catch(error){return errorResponse(error);}}

export const GET=observeProjectRoute(observedGET);
export const POST=observeProjectRoute(observedPOST);
