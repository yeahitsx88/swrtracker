import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
import {ValidationError} from '@/shared/errors';
import {requireIdempotencyKey,executeIdempotentHttpMutation} from '@/lib/idempotency';
import {setProjectAdministrator} from '@/modules/tenancy/application/project-administration';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string}>};
export async function GET(req:NextRequest,ctx:Context){try{
  const auth=await requireActiveAuth(req),{projectId}=await ctx.params;requireResourceUuid(projectId,'projectId');await assertProjectAdministrator(pool,auth,projectId as UUID);
  const limit=Number(req.nextUrl.searchParams.get('limit')??100),offset=Number(req.nextUrl.searchParams.get('offset')??0);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)throw new ValidationError('Invalid administrator page');
  const {rows}=await pool.query(`SELECT pm.user_id AS "userId",u.name,u.email,pm.role,pm.access_disabled_at AS "accessDisabledAt",u.deactivated_at AS "accountDisabledAt",
    EXISTS(SELECT 1 FROM project_admin_grants g WHERE g.tenant_id=$1 AND g.project_id=$2 AND g.user_id=u.id AND g.revoked_at IS NULL) AS "canAdminister"
    FROM project_memberships pm JOIN users u ON u.id=pm.user_id AND u.tenant_id=$1 JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
    WHERE pm.project_id=$2 AND c.type IN ('GC','OWNER_REP') ORDER BY lower(u.name),u.id LIMIT $3 OFFSET $4`,[auth.tenantId,projectId,limit,offset]);
  return NextResponse.json({administrators:rows,limit,offset},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return errorResponse(error);}}
export async function POST(req:NextRequest,ctx:Context){try{
  const auth=await requireActiveAuth(req),{projectId}=await ctx.params;requireResourceUuid(projectId,'projectId');
  const body=await req.json() as Record<string,unknown>,key=requireIdempotencyKey(req);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(field=>!['userId','enabled','confirmed'].includes(field))||typeof body.userId!=='string'||typeof body.enabled!=='boolean'||body.confirmed!==true)throw new ValidationError('Confirm a project administrator assignment');
  requireResourceUuid(body.userId,'userId');
  const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST /api/projects/${projectId}/administrators`,idempotencyKey:key},body,
    async()=>({status:200,body:await setProjectAdministrator(db,auth,projectId as UUID,body.userId as UUID,body.enabled as boolean)})),
    {req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{await assertProjectAdministrator(db,current,projectId as UUID);}});
  return NextResponse.json(result.body,{status:result.status});
}catch(error){return errorResponse(error);}}
