import {observeProjectRoute} from '@/lib/observe-project-route';
import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {withTransaction} from '@/lib/with-transaction';
import {getProjectRole} from '@/lib/get-project-role';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
import {acquireTenantLifecycleLock,assertMutationIdentity} from '@/lib/tenant-lifecycle-lock';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {parseReorganization,reorganizeSurvey} from '@/modules/tenancy/application/reorganize-survey';
import {SurveyReorganizationPgRepository} from '@/modules/tenancy/infrastructure/survey-reorganization.repository';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string}>};
const repo=new SurveyReorganizationPgRepository();
async function run(req:NextRequest,ctx:Context,command:boolean){try{
 const auth=await requireActiveAuth(req),projectId=(await ctx.params).projectId;requireResourceUuid(projectId,'projectId');
 const selection=parseReorganization(command?await req.json():Object.fromEntries([...req.nextUrl.searchParams].map(([k,v])=>[k,k==='superintendentId'&&v==='null'?null:v])),command);
 const key=command?requireIdempotencyKey(req):undefined;
 const result=await withTransaction(async db=>{
  await acquireTenantLifecycleLock(db,auth.tenantId,'EXCLUSIVE');assertMutationIdentity(await requireActiveAuth(req,db),auth);
  const actor={tenantId:auth.tenantId,projectId:projectId as UUID,actorId:auth.userId,actorRole:await getProjectRole(db,auth.tenantId,projectId as UUID,auth.userId,auth.sessionVersion),sessionVersion:auth.sessionVersion};
  await repo.authorize(db,actor);
  if(!command){const preview=await repo.preview(db,actor,selection);const {state,...display}=preview;void state;return {status:200,body:{preview:display}};}
  return executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST /api/projects/${projectId}/survey/reorganization`,idempotencyKey:key!},selection,async()=>({status:200,body:await reorganizeSurvey(repo,db,actor,selection as Parameters<typeof reorganizeSurvey>[3])}));
 });return NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store'}});
}catch(error){return errorResponse(error);}}
async function observedGET(req:NextRequest,ctx:Context){return run(req,ctx,false);}
async function observedPOST(req:NextRequest,ctx:Context){return run(req,ctx,true);}

export const GET=observeProjectRoute(observedGET);
export const POST=observeProjectRoute(observedPOST);
