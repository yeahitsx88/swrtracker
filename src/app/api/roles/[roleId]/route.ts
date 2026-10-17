import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { withTransaction } from '@/lib/with-transaction';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { authorizeCustomRoleManagement, saveCustomRole, deleteCustomRole } from '@/modules/tenancy/application/custom-roles';
import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';
export const dynamic = 'force-dynamic';
type Context={params:Promise<{roleId:string}>};
async function mutate(req:NextRequest,ctx:Context) { try {
  const auth=await requireActiveAuth(req),{roleId}=await ctx.params;requireResourceUuid(roleId,'roleId');
  const body=await req.json(),key=requireIdempotencyKey(req),editing=req.method==='PATCH';
  const fields=editing?['name','baseRole','version','confirmed']:['version','confirmed'];
  if (!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!fields.includes(k))||body.confirmed!==true||!Number.isInteger(body.version)||body.version<1) throw new ValidationError('Review and confirm the current role version.');
  const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`${req.method} /api/roles/${roleId}`,idempotencyKey:key},body,
    async()=>({status:200,body:editing?{role:await saveCustomRole(db,auth,body,roleId as UUID,body.version)}:await deleteCustomRole(db,auth,roleId as UUID,body.version)})),
    {req,auth,mode:'EXCLUSIVE',authorize:authorizeCustomRoleManagement});
  return NextResponse.json(result.body,{status:result.status});
} catch(error) {return errorResponse(error);} }
export const PATCH=mutate;
export const DELETE=mutate;
