import {NextResponse,type NextRequest} from 'next/server';
import {ValidationError,ConflictError} from '@/shared/errors';
import {errorResponse} from '@/lib/api-error';
import {requireActiveAuth} from '@/lib/auth';
import {assertAccessAdministrator} from '@/lib/access-administrator';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {requireIdempotencyKey,executeIdempotentHttpMutation} from '@/lib/idempotency';
import {pool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import {CompanyAccessRepository} from '@/modules/identity/infrastructure/company-access.repository';
import {issueRequesterInvitation} from '@/modules/identity/application/requester-invitations';
import type {DbClient,UUID} from '@/shared/types';

export interface RequesterInviteRouteDeps {
  requireAuth: typeof requireActiveAuth; authorize: typeof assertAccessAdministrator;
  db: DbClient; repo: CompanyAccessRepository; withTransaction: typeof withTransaction;
  appendEvent: typeof appendAdministrativeEvent;
}
const defaults:RequesterInviteRouteDeps={requireAuth:requireActiveAuth,authorize:assertAccessAdministrator,db:pool,repo:new CompanyAccessRepository(),withTransaction,appendEvent:appendAdministrativeEvent};
type Context={params:Promise<{projectId:string}>};
export async function handleGetRequesterInvites(req:NextRequest,ctx:Context,deps:RequesterInviteRouteDeps=defaults){
  try{
    const auth=await deps.requireAuth(req),{projectId}=await ctx.params;
    requireResourceUuid(projectId,'projectId');await deps.authorize(deps.db,auth,projectId as UUID);
    return NextResponse.json(await deps.repo.listRequesterInvitationOptions(deps.db,auth.tenantId,projectId as UUID),{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return errorResponse(error);}
}
export async function handlePostRequesterInvite(req:NextRequest,ctx:Context,deps:RequesterInviteRouteDeps=defaults){
  try{
    const auth=await deps.requireAuth(req),{projectId}=await ctx.params;
    requireResourceUuid(projectId,'projectId');
    const body=await req.json() as Record<string,unknown>;
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['companyId','email'].includes(k))||typeof body.companyId!=='string'||typeof body.email!=='string') throw new ValidationError('companyId and email are required; invitations grant Requester access only.');
    requireResourceUuid(body.companyId,'companyId');
    const companyId=body.companyId as UUID,email=body.email,key=requireIdempotencyKey(req);
    const result=await deps.withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST /api/projects/${projectId}/invites`,idempotencyKey:key},body,async()=>{
      const issued=await issueRequesterInvitation(deps.repo,db,{tenantId:auth.tenantId,projectId:projectId as UUID,companyId,email,invitedBy:auth.userId});
      await deps.appendEvent(db,{auth,projectId:projectId as UUID,subjectUserId:null,eventType:'user.invited',authorityEvidence:{capability:'ACCESS_ADMINISTRATOR'},changes:{companyId,email:issued.email,role:'REQUESTER',expiresAt:issued.expiresAt}});
      return {status:201,body:{inviteToken:issued.invite.token}};
    }),{req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{
      await deps.authorize(db,current,projectId as UUID);
      if(!await deps.repo.isProjectOpen(db,current.tenantId,projectId as UUID)) throw new ConflictError('This project no longer accepts invitations.');
    }});
    return NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return errorResponse(error);}
}
