import {randomUUID} from 'node:crypto';
import type {NextRequest} from 'next/server';
import {requireActiveAuth,type AuthContext} from './auth';
import {pool} from './db';
import {resolveProjectCapabilities} from './project-capabilities';
import {getTicketRouteContext} from './ticket-route-helpers';
import {recordRequestObservation} from '@/modules/support/infrastructure/request-observation';
import type {UUID} from '@/shared/types';
import {logError} from './observability';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Context={params:Promise<{projectId?:string;ticketId?:string}>};
/** Preserve the original endpoint contract; record only verified project/visible-ticket scope. */
export function observeProjectRoute<C extends Context,R extends Response>(handler:(req:NextRequest,context:C)=>Promise<R>){
 return async(req:NextRequest,context:C):Promise<R>=>{
  const started=performance.now();let auth:AuthContext|undefined,projectId:UUID|undefined,ticketId:UUID|null=null,priorStatus:string|null=null;
  try{
   const params=await context.params;auth=await requireActiveAuth(req);
   if(params.ticketId&&uuid.test(params.ticketId)){
    const ticket=await getTicketRouteContext(req,params.ticketId);projectId=ticket.projectId;ticketId=ticket.ticketId;
    priorStatus=(await pool.query<{status:string}>('SELECT status FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND id=$3',[auth.tenantId,projectId,ticketId])).rows[0]?.status??null;
   }else if(params.projectId&&uuid.test(params.projectId)){
    const capability=await resolveProjectCapabilities(pool,auth,params.projectId as UUID);
    if(capability.operationalRole||capability.canAdminister)projectId=params.projectId as UUID;
   }
  }catch{/* Original handler owns all authorization and error behavior. */}
  const response=await handler(req,context),durationMs=performance.now()-started;
  let correlationId=randomUUID() as UUID,errorCode:string|null=null;
  if(response.status>=400){try{const data=await response.clone().json();if(uuid.test(data?.error?.correlationId))correlationId=data.error.correlationId;if(typeof data?.error?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(data.error.code))errorCode=data.error.code;}catch{/* Streaming/non-JSON responses have no error code. */}}
  try{response.headers.set('X-Request-ID',correlationId);}catch{/* Preserve immutable responses. */}
  if(auth&&projectId&&['GET','POST','PATCH','PUT','DELETE'].includes(req.method))try{
   const route=req.nextUrl.pathname.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,'[id]').slice(0,240);
   await recordRequestObservation(req,auth,{projectId,route,method:req.method,status:response.status,durationMs,correlationId,errorCode,ticketId,priorStatus});
  }catch{logError('Project request observation could not be recorded',{eventType:'diagnostics.observation_failed',correlation_id:correlationId});}
  return response;
 };
}
