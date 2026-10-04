import {observeProjectRoute} from '@/lib/observe-project-route';
import {readJsonBody} from '@/lib/read-json-body';
import {NextResponse,type NextRequest} from 'next/server';
import type {UUID} from '@/shared/types';
import {requireActiveAuth} from '@/lib/auth';
import {withTransaction} from '@/lib/with-transaction';
import {errorResponse} from '@/lib/api-error';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {requireIdempotencyKey,executeIdempotentHttpMutation} from '@/lib/idempotency';
import {parseRecommissionCommand,recommissionProject,requireRecommissionAuthority} from '@/modules/tenancy/application/recommission-project';
import {SqlRecommissionRepository} from '@/modules/tenancy/infrastructure/recommission-project.repository';
type Context={params:Promise<{projectId:string}>};
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
async function observedGET(req:NextRequest,context:Context){try{const auth=await requireActiveAuth(req),projectId=(await context.params).projectId as UUID;requireResourceUuid(projectId,'projectId');const preview=await withTransaction(db=>new SqlRecommissionRepository().preview(db,auth,projectId),{req,auth,mode:'EXCLUSIVE',authorize:db=>requireRecommissionAuthority(db,auth)});return NextResponse.json({preview},{headers});}catch(error){return errorResponse(error);}}
async function observedPOST(req:NextRequest,context:Context){try{const auth=await requireActiveAuth(req),projectId=(await context.params).projectId as UUID,command=parseRecommissionCommand(await readJsonBody(req)),key=requireIdempotencyKey(req);requireResourceUuid(projectId,'projectId');
 const response=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`/api/projects/${projectId}/recommission`,idempotencyKey:key},command,async()=>({status:200,body:await recommissionProject(new SqlRecommissionRepository(),db,auth,projectId,command)})),{req,auth,mode:'EXCLUSIVE',authorize:db=>requireRecommissionAuthority(db,auth)});
 return NextResponse.json(response.body,{status:response.status,headers});}catch(error){return errorResponse(error);}}

export const GET=observeProjectRoute(observedGET);
export const POST=observeProjectRoute(observedPOST);
