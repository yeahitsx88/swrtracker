import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {errorResponse} from '@/lib/api-error';
import {withTransaction} from '@/lib/with-transaction';
import {coordinateAuthenticatedMutation} from '@/lib/tenant-lifecycle-lock';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {observeProjectRoute} from '@/lib/observe-project-route';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {ValidationError} from '@/shared/errors';
import {TicketRepository} from '@/modules/ticket/infrastructure/ticket.repository';
import {authorizeSubmittedRecovery,recoverSubmittedRequest} from '@/modules/ticket/application/recover-submitted-request';
import {SUBMITTED_RECOVERY_STATUSES} from '@/modules/workflow/domain/submitted-recovery';
import type {SubmittedRecoveryInput} from '@/lib/contracts/submitted-recovery';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
export const POST=observeProjectRoute(async(req:NextRequest,{params}:{params:Promise<{projectId:string;ticketId:string}>})=>{
 try{
  const auth=await requireActiveAuth(req),{projectId,ticketId}=await params;requireResourceUuid(projectId,'projectId');requireResourceUuid(ticketId,'ticketId');
  const key=requireIdempotencyKey(req),body=await req.json() as SubmittedRecoveryInput;
  if(!body||Object.keys(body).some(k=>!['expectedVersion','expectedStatus','reason','confirmed'].includes(k))||body.confirmed!==true||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.trim().length>1000||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0||!SUBMITTED_RECOVERY_STATUSES.includes(body.expectedStatus))throw new ValidationError('Review the current request status/version, a 10–1000 character reason and explicit confirmation.');
  const result=await withTransaction(async db=>{
   await coordinateAuthenticatedMutation(db,req,auth,'SHARED',requireActiveAuth);
   const repo=new TicketRepository(),scope=await authorizeSubmittedRecovery(db,repo,auth,projectId as UUID,ticketId as UUID);
   return executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST:/api/projects/${projectId}/request-recovery/${ticketId}`,idempotencyKey:key},body,async()=>({status:200,body:await recoverSubmittedRequest(db,repo,auth,scope,body)}));
  });
  return NextResponse.json(result.body,{status:result.status});
 }catch(error){return errorResponse(error);}
});
