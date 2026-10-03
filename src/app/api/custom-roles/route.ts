import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {getTenantRole} from '@/lib/get-tenant-role';
import {pool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import {errorResponse} from '@/lib/api-error';
import {readJsonBody} from '@/lib/read-json-body';
import {ValidationError} from '@/shared/errors';
import {requireIdempotencyKey,executeIdempotentHttpMutation} from '@/lib/idempotency';
import {authorizeCustomRoleCreation,createCustomRole,validateCustomRole} from '@/modules/tenancy/application/custom-roles';
import {listCustomRoles} from '@/modules/tenancy/infrastructure/custom-role.repository';
import type {CreateCustomRole} from '@/modules/tenancy/domain/custom-role';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
 const auth=await requireActiveAuth(req);
 const [roles,tenantRole]=await Promise.all([listCustomRoles(pool,auth.tenantId),getTenantRole(pool,auth.tenantId,auth.userId,auth.sessionVersion)]);
 return NextResponse.json({roles,canCreate:tenantRole==='TENANT_ADMIN'},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return errorResponse(error);}}
export async function POST(req:NextRequest){try{
 const auth=await requireActiveAuth(req),body=await readJsonBody(req),key=requireIdempotencyKey(req);
 if(!body||typeof body!=='object'||Array.isArray(body))throw new ValidationError('Review the custom role');
 const b=body as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['name','description','baseRole','confirmed'].includes(k))||typeof b.name!=='string'||typeof b.description!=='string'||typeof b.baseRole!=='string'||b.confirmed!==true)throw new ValidationError('Confirm the reviewed custom role');
 const input:CreateCustomRole={name:b.name.trim().replace(/\s+/g,' '),description:b.description.trim(),baseRole:b.baseRole as CreateCustomRole['baseRole'],confirmed:true};validateCustomRole(input);
 const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:'POST /api/custom-roles',idempotencyKey:key},input,async()=>({status:201,body:await createCustomRole(db,auth,input)})),{req,auth,mode:'EXCLUSIVE',authorize:authorizeCustomRoleCreation});
 return NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store'}});
}catch(error){return errorResponse(error);}}
