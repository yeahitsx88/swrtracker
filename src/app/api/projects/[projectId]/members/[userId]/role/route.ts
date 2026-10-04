import {observeProjectRoute} from '@/lib/observe-project-route';
import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {assertRecommissioningMutation} from '@/lib/recommissioning-gate';
import {withTransaction} from '@/lib/with-transaction';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
import {ValidationError} from '@/shared/errors';
import type {UUID} from '@/shared/types';
import {assignTemplateRole} from '@/modules/tenancy/application/assign-template-role';
export const dynamic='force-dynamic';
async function observedPATCH(req:NextRequest,{params}:{params:Promise<{projectId:string;userId:string}>}){
  try{
    const auth=await requireActiveAuth(req),{projectId,userId}=await params;
    requireResourceUuid(projectId,'projectId');requireResourceUuid(userId,'userId');
    const body=await req.json() as Record<string,unknown>;
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['role','customRoleId','customRoleVersion','sessionVersion','confirmed'].includes(k))||
      !['REQUESTER','VIEWER'].includes(String(body.role))||!Number.isInteger(body.sessionVersion)||Number(body.sessionVersion)<1||body.confirmed!==true)throw new ValidationError('Choose Requester, Viewer or a custom role, and confirm the current member access.');
    if(body.customRoleId!==undefined){if(typeof body.customRoleId!=='string')throw new ValidationError('Invalid custom role ID');requireResourceUuid(body.customRoleId,'customRoleId');if(!Number.isInteger(body.customRoleVersion)||Number(body.customRoleVersion)<1)throw new ValidationError('Provide the current custom role version.');}
    else if(body.customRoleVersion!==undefined)throw new ValidationError('A custom role ID is required with its version.');
    const key=requireIdempotencyKey(req);
    const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`PATCH /api/projects/${projectId}/members/${userId}/role`,idempotencyKey:key},body,
      async()=>({status:200,body:await assignTemplateRole(db,auth,projectId as UUID,userId as UUID,body as unknown as Parameters<typeof assignTemplateRole>[4])})),
      {req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{await assertProjectAdministrator(db,current,projectId as UUID);await assertRecommissioningMutation(db,current.tenantId,projectId as UUID);}});
    return NextResponse.json(result.body,{status:result.status});
  }catch(error){return errorResponse(error);}
}

export const PATCH=observeProjectRoute(observedPATCH);
