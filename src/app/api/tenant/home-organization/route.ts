import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {getTenantRole} from '@/lib/get-tenant-role';
import {pool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import {errorResponse} from '@/lib/api-error';
import {readJsonBody} from '@/lib/read-json-body';
import {ValidationError} from '@/shared/errors';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {requireIdempotencyKey,executeIdempotentHttpMutation} from '@/lib/idempotency';
import {authorizeHomeOrganization,designateHomeOrganization} from '@/modules/tenancy/application/home-organization';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
 const auth=await requireActiveAuth(req),canManage=await getTenantRole(pool,auth.tenantId,auth.userId,auth.sessionVersion)==='TENANT_ADMIN';
 const company=(await pool.query('SELECT c.id,c.name,c.type FROM tenants t JOIN companies c ON c.tenant_id=t.id AND c.id=t.home_company_id WHERE t.id=$1',[auth.tenantId])).rows[0]??null;
 const search=req.nextUrl.searchParams.get('search')??'';
 if(search.length>100)throw new ValidationError('Company search is too long');
 const companies=canManage?(await pool.query("SELECT id,name,type FROM companies WHERE tenant_id=$1 AND type IN ('GC','OWNER_REP') AND name ILIKE $2 ORDER BY lower(name),id LIMIT 100",[auth.tenantId,'%'+search+'%'])).rows:[];
 return NextResponse.json({company,companies,canManage},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return errorResponse(error);}}
export async function PATCH(req:NextRequest){try{
 const auth=await requireActiveAuth(req),body=await readJsonBody(req),key=requireIdempotencyKey(req);
 if(!body||typeof body!=='object'||Array.isArray(body))throw new ValidationError('Review the home organization');
 const b=body as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['companyId','expectedCompanyId','confirmed'].includes(k))||typeof b.companyId!=='string'||!(b.expectedCompanyId===null||typeof b.expectedCompanyId==='string')||b.confirmed!==true)throw new ValidationError('Confirm the reviewed home organization');
 requireResourceUuid(b.companyId,'companyId');if(b.expectedCompanyId!==null)requireResourceUuid(b.expectedCompanyId as string,'expectedCompanyId');
 const input={companyId:b.companyId as UUID,expectedCompanyId:b.expectedCompanyId as UUID|null,confirmed:true as const};
 const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:'PATCH /api/tenant/home-organization',idempotencyKey:key},input,async()=>({status:200,body:await designateHomeOrganization(db,auth,input)})),{req,auth,mode:'EXCLUSIVE',authorize:authorizeHomeOrganization});
 return NextResponse.json(result.body,{status:result.status});
}catch(error){return errorResponse(error);}}
