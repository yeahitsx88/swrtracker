import {observeProjectRoute} from '@/lib/observe-project-route';
import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
import {ForbiddenError,ValidationError} from '@/shared/errors';
import type {UUID} from '@/shared/types';
import {supportDetail,updateSupport} from '@/modules/support/application/help-desk';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string;supportId:string}>};
async function observedGET(req:NextRequest,{params}:Context){try{const auth=await requireActiveAuth(req),{projectId,supportId}=await params;requireResourceUuid(projectId,'projectId');requireResourceUuid(supportId,'supportId');return NextResponse.json(await supportDetail(pool,auth,projectId as UUID,supportId as UUID),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}
async function observedPATCH(req:NextRequest,{params}:Context){try{
 const auth=await requireActiveAuth(req),{projectId,supportId}=await params;requireResourceUuid(projectId,'projectId');requireResourceUuid(supportId,'supportId');const body=await req.json(),key=requireIdempotencyKey(req);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['version','status','message','confirmed'].includes(k))||!Number.isInteger(body.version)||body.version<1||typeof body.message!=='string'||body.confirmed!==true||body.status!==undefined&&typeof body.status!=='string')throw new ValidationError('Review the current help desk ticket and confirm your reply.');
 const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`PATCH /api/projects/${projectId}/help-desk/${supportId}`,idempotencyKey:key},body,async()=>({status:200,body:await updateSupport(db,auth,projectId as UUID,supportId as UUID,body)})),{req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{const detail=await supportDetail(db,current,projectId as UUID,supportId as UUID);if(body.status!==undefined&&!detail.canManage)throw new ForbiddenError('Only administrators can change help desk status.');}});
 return NextResponse.json(result.body,{status:result.status});
}catch(e){return errorResponse(e);}}

export const GET=observeProjectRoute(observedGET);
export const PATCH=observeProjectRoute(observedPATCH);
