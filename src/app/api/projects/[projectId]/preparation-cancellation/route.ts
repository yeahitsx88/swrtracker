import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {readJsonBody} from '@/lib/read-json-body';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {withTransaction} from '@/lib/with-transaction';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {errorResponse} from '@/lib/api-error';
import {observeProjectRoute} from '@/lib/observe-project-route';
import {requireRecommissionAuthority} from '@/modules/tenancy/application/recommission-project';
import {parsePreparationCancellation,cancelProjectPreparation,authorizePreparationCancellationCommand} from '@/modules/tenancy/application/cancel-project-preparation';
import {SqlPreparationCancellationRepository} from '@/modules/tenancy/infrastructure/cancel-project-preparation.repository';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';const headers={'Cache-Control':'private, no-store'};type Context={params:Promise<{projectId:string}>};
async function observedGET(req:NextRequest,context:Context){try{const auth=await requireActiveAuth(req),projectId=(await context.params).projectId as UUID;requireResourceUuid(projectId,'projectId');const preview=await withTransaction(db=>new SqlPreparationCancellationRepository().preview(db,auth,projectId),{req,auth,mode:'EXCLUSIVE',authorize:db=>requireRecommissionAuthority(db,auth)});return NextResponse.json({preview},{headers});}catch(e){return errorResponse(e);}}
async function observedPOST(req:NextRequest,context:Context){try{const auth=await requireActiveAuth(req),projectId=(await context.params).projectId as UUID,command=parsePreparationCancellation(await readJsonBody(req)),key=requireIdempotencyKey(req),repo=new SqlPreparationCancellationRepository();requireResourceUuid(projectId,'projectId');
 const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`/api/projects/${projectId}/preparation-cancellation`,idempotencyKey:key},command,async()=>({status:200,body:await cancelProjectPreparation(repo,db,auth,projectId,command)})),{req,auth,mode:'EXCLUSIVE',authorize:db=>authorizePreparationCancellationCommand(repo,db,auth,projectId,command)});
 return NextResponse.json(result.body,{status:result.status,headers});}catch(e){return errorResponse(e);}}
export const GET=observeProjectRoute(observedGET);export const POST=observeProjectRoute(observedPOST);
