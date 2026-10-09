import {observeProjectRoute} from '@/lib/observe-project-route';
import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {withTransaction} from '@/lib/with-transaction';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {managerSelection,parseManagerAppointment,appointSurveyManager} from '@/modules/tenancy/application/appoint-survey-manager';
import {SurveyManagerPgRepository} from '@/modules/tenancy/infrastructure/survey-manager.repository';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string}>};
async function handle(req:NextRequest,ctx:Context){
 try{
  const auth=await requireActiveAuth(req),{projectId}=await ctx.params;requireResourceUuid(projectId,'projectId');const id=projectId.toLowerCase() as UUID,repo=new SurveyManagerPgRepository();
  const input=req.method==='POST'?parseManagerAppointment(await req.json()):managerSelection(Object.fromEntries(req.nextUrl.searchParams));
  const key=req.method==='POST'?requireIdempotencyKey(req):null;
  const result=await withTransaction(async db=>{
   if(!key)return {status:200,body:{preview:await repo.preview(db,auth,id,input)}};
   return executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST:/api/projects/${id}/survey/manager-handover`,idempotencyKey:key},input,async()=>({status:200,body:{result:await appointSurveyManager(repo,db,auth,id,input as ReturnType<typeof parseManagerAppointment>)}}));
  },{req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{await assertProjectAdministrator(db,current,id);await repo.assertEditableProject(db,current,id);}});
  const response=NextResponse.json(result.body,{status:result.status});response.headers.set('Cache-Control','private, no-store');return response;
 }catch(error){return errorResponse(error);}
}


export const GET=observeProjectRoute(handle);
export const POST=observeProjectRoute(handle);
