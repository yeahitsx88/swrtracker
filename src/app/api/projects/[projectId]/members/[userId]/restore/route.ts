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
import {restoreProjectMember} from '@/modules/tenancy/application/restore-project-member';
export const dynamic='force-dynamic';
async function observedPOST(req:NextRequest,{params}:{params:Promise<{projectId:string;userId:string}>}){
 try{
  const auth=await requireActiveAuth(req),{projectId,userId}=await params;requireResourceUuid(projectId,'projectId');requireResourceUuid(userId,'userId');
  const body=await req.json() as Record<string,unknown>,key=requireIdempotencyKey(req);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['sessionVersion','disabledAt','reason','confirmed'].includes(k))||!Number.isInteger(body.sessionVersion)||Number(body.sessionVersion)<1||typeof body.disabledAt!=='string'||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.length>1000||body.confirmed!==true)throw new ValidationError('Review the removed member and confirm a restoration reason of 10–1000 characters.');
  const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST /api/projects/${projectId}/members/${userId}/restore`,idempotencyKey:key},body,async()=>({status:200,body:await restoreProjectMember(db,auth,projectId as UUID,userId as UUID,body as unknown as Parameters<typeof restoreProjectMember>[4])})),
   {req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{await assertProjectAdministrator(db,current,projectId as UUID);await assertRecommissioningMutation(db,current.tenantId,projectId as UUID);}});
  return NextResponse.json(result.body,{status:result.status});
 }catch(e){return errorResponse(e);}
}

export const POST=observeProjectRoute(observedPOST);
