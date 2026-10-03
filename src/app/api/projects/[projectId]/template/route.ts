import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
import {ValidationError} from '@/shared/errors';
import {requireIdempotencyKey,executeIdempotentHttpMutation} from '@/lib/idempotency';
import {selectProjectTemplate} from '@/modules/tenancy/application/project-administration';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string}>};
export async function GET(req:NextRequest,ctx:Context){try{
  const auth=await requireActiveAuth(req),{projectId}=await ctx.params;requireResourceUuid(projectId,'projectId');const authority=await assertProjectAdministrator(pool,auth,projectId as UUID);
  const templates=(await pool.query(`SELECT id,name,crew_build AS "crewBuild" FROM project_templates WHERE tenant_id=$1 ORDER BY lower(name),id`,[auth.tenantId])).rows;
  const project=(await pool.query('SELECT status,template_id AS "templateId",crew_build AS "crewBuild",(activated_at IS NOT NULL OR EXISTS(SELECT 1 FROM project_recommissioning pr WHERE pr.tenant_id=projects.tenant_id AND pr.project_id=projects.id AND pr.opened_at IS NULL)) AS "hasBeenActivated" FROM projects WHERE tenant_id=$1 AND id=$2',[auth.tenantId,projectId])).rows[0];
  return NextResponse.json({templates,project,canCreateTemplate:authority.centralIT});
}catch(error){return errorResponse(error);}}
export async function PATCH(req:NextRequest,ctx:Context){try{
  const auth=await requireActiveAuth(req),{projectId}=await ctx.params;requireResourceUuid(projectId,'projectId');
  const body=await req.json() as Record<string,unknown>,key=requireIdempotencyKey(req);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(field=>!['templateId','confirmed'].includes(field))||typeof body.templateId!=='string'||body.confirmed!==true)throw new ValidationError('Confirm a project template selection');
  requireResourceUuid(body.templateId,'templateId');
  const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`PATCH /api/projects/${projectId}/template`,idempotencyKey:key},body,
    async()=>{await selectProjectTemplate(db,auth,projectId as UUID,body.templateId as UUID);return{status:200,body:{selected:true}};}),{req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{await assertProjectAdministrator(db,current,projectId as UUID);}});
  return NextResponse.json(result.body,{status:result.status});
}catch(error){return errorResponse(error);}}
