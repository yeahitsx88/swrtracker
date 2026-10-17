import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api-error';
import { pool } from '@/lib/db';
import { withTransaction } from '@/lib/with-transaction';
import { requireResourceUuid } from '@/lib/resource-uuid';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { authorizeCustomRoleManagement, readCustomRoles, saveCustomRole } from '@/modules/tenancy/application/custom-roles';
import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) { try {
  const auth=await requireActiveAuth(req),projectId=req.nextUrl.searchParams.get('projectId')??undefined;
  if (projectId) requireResourceUuid(projectId,'projectId');
  return NextResponse.json({roles:await readCustomRoles(pool,auth,projectId as UUID|undefined)},{headers:{'Cache-Control':'private, no-store'}});
} catch(error) {return errorResponse(error);} }
export async function POST(req: NextRequest) { try {
  const auth=await requireActiveAuth(req),body=await req.json(),key=requireIdempotencyKey(req);
  if (!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['name','baseRole','confirmed'].includes(k))||body.confirmed!==true) throw new ValidationError('Review and confirm the tenant-wide role.');
  const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:'POST /api/roles',idempotencyKey:key},body,
    async()=>({status:201,body:{role:await saveCustomRole(db,auth,body)}})),{req,auth,mode:'EXCLUSIVE',authorize:authorizeCustomRoleManagement});
  return NextResponse.json(result.body,{status:result.status});
} catch(error) {return errorResponse(error);} }
