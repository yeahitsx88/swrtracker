import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {readJsonBody} from '@/lib/read-json-body';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {withTransaction} from '@/lib/with-transaction';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {errorResponse} from '@/lib/api-error';
import {observeProjectRoute} from '@/lib/observe-project-route';
import {parseInvitationCancellation,authorizeInvitationCancellation,requireInvitationCancellationAuthority,cancelProjectInvitation} from '@/modules/identity/application/cancel-project-invitation';
import {SqlInvitationCancellationRepository} from '@/modules/identity/infrastructure/cancel-project-invitation.repository';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';const headers={'Cache-Control':'private, no-store'};type Context={params:Promise<{projectId:string;inviteId:string}>};
async function ids(context:Context){const p=await context.params;requireResourceUuid(p.projectId,'projectId');requireResourceUuid(p.inviteId,'inviteId');return {projectId:p.projectId as UUID,inviteId:p.inviteId as UUID};}
async function observedGET(req:NextRequest,context:Context){try{
 const auth=await requireActiveAuth(req),{projectId,inviteId}=await ids(context);
 const preview=await withTransaction(db=>new SqlInvitationCancellationRepository().preview(db,auth,projectId,inviteId),{req,auth,mode:'SHARED',authorize:db=>requireInvitationCancellationAuthority(db,auth,projectId)});
 return NextResponse.json({preview},{headers});
}catch(e){return errorResponse(e);}}
async function observedPOST(req:NextRequest,context:Context){try{
 const auth=await requireActiveAuth(req),{projectId,inviteId}=await ids(context),command=parseInvitationCancellation(await readJsonBody(req)),key=requireIdempotencyKey(req),repo=new SqlInvitationCancellationRepository();
 const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`/api/projects/${projectId}/invites/${inviteId}/cancel`,idempotencyKey:key},command,async()=>({status:200,body:await cancelProjectInvitation(repo,db,auth,projectId,inviteId,command)})),{req,auth,mode:'EXCLUSIVE',authorize:db=>authorizeInvitationCancellation(db,auth,projectId,inviteId)});
 return NextResponse.json(result.body,{status:result.status,headers});
}catch(e){return errorResponse(e);}}
export const GET=observeProjectRoute(observedGET);export const POST=observeProjectRoute(observedPOST);
