import {observeProjectRoute} from '@/lib/observe-project-route';
import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
import {ValidationError} from '@/shared/errors';
import type {UUID} from '@/shared/types';
import {authorizeSupport,createSupport,readSupport} from '@/modules/support/application/help-desk';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string}>};
async function observedGET(req:NextRequest,{params}:Context){try{const auth=await requireActiveAuth(req),{projectId}=await params;requireResourceUuid(projectId,'projectId');const offset=Number(req.nextUrl.searchParams.get('offset')??0);if(!Number.isSafeInteger(offset)||offset<0)throw new ValidationError('Invalid help desk page.');return NextResponse.json(await readSupport(pool,auth,projectId as UUID,offset),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}
async function observedPOST(req:NextRequest,{params}:Context){try{
 const auth=await requireActiveAuth(req),{projectId}=await params;requireResourceUuid(projectId,'projectId');const body=await req.json(),key=requireIdempotencyKey(req);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['subject','description','confirmed'].includes(k))||body.confirmed!==true)throw new ValidationError('Review and confirm your help desk ticket.');
 const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST /api/projects/${projectId}/help-desk`,idempotencyKey:key},body,async()=>({status:201,body:{ticket:await createSupport(db,auth,projectId as UUID,body)}})),{req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{await authorizeSupport(db,current,projectId as UUID);}});
 return NextResponse.json(result.body,{status:result.status});
}catch(e){return errorResponse(e);}}

export const GET=observeProjectRoute(observedGET);
export const POST=observeProjectRoute(observedPOST);
