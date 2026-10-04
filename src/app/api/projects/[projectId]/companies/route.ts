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
import {registerProjectCompany,removeProjectCompanies,authorizeWritable} from '@/modules/tenancy/application/project-administration';
import {readProjectCompanies} from '@/modules/tenancy/infrastructure/project-companies.reader';
import {assertRecommissioningMutation} from '@/lib/recommissioning-gate';
import type {CompanyType} from '@/modules/tenancy/domain/types';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string}>};
async function observedGET(req:NextRequest,ctx:Context){try{
  const auth=await requireActiveAuth(req),{projectId}=await ctx.params;requireResourceUuid(projectId,'projectId');await assertProjectAdministrator(pool,auth,projectId as UUID);
  const limit=Number(req.nextUrl.searchParams.get('limit')??100),offset=Number(req.nextUrl.searchParams.get('offset')??0);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw new ValidationError('Invalid candidate page');
  const companies=await readProjectCompanies(pool,auth.tenantId,projectId as UUID);
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
async function observedDELETE(req:NextRequest,ctx:Context){try{
  const auth=await requireActiveAuth(req),{projectId}=await ctx.params;requireResourceUuid(projectId,'projectId');
  const body=await req.json() as Record<string,unknown>,key=requireIdempotencyKey(req);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(field=>!['companies','confirmed'].includes(field))||body.confirmed!==true||!Array.isArray(body.companies)||!body.companies.length||body.companies.length>1000)throw new ValidationError('Review and confirm between 1 and 1000 project companies');
  const selected=body.companies.map((value:unknown)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new ValidationError('Invalid company selection');
    const c=value as Record<string,unknown>;
    if(Object.keys(c).some(field=>!['id','associatedAt'].includes(field))||typeof c.id!=='string'||typeof c.associatedAt!=='string'||!c.associatedAt.length||c.associatedAt.length>100)throw new ValidationError('Each company requires its reviewed association');
    requireResourceUuid(c.id,'companyId');return {id:c.id as UUID,associatedAt:c.associatedAt};
  });
  if(new Set(selected.map(c=>c.id)).size!==selected.length)throw new ValidationError('Select each company only once');
  const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`DELETE /api/projects/${projectId}/companies`,idempotencyKey:key},body,
    async()=>({status:200,body:await removeProjectCompanies(db,auth,projectId as UUID,selected)})),{req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{
      await authorizeWritable(db,current,projectId as UUID);await assertRecommissioningMutation(db,current.tenantId,projectId as UUID);
    }});
  return NextResponse.json(result.body,{status:result.status});
}catch(error){return errorResponse(error);}}
export const DELETE=observeProjectRoute(observedDELETE);
