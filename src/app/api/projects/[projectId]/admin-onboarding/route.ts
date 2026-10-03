import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {pool} from '@/lib/db';
import {withTransaction} from '@/lib/with-transaction';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {readJsonBody} from '@/lib/read-json-body';
import {errorResponse} from '@/lib/api-error';
import {ValidationError} from '@/shared/errors';
import {requireIdempotencyKey,executeIdempotentHttpMutation} from '@/lib/idempotency';
import {AdminOnboardingRepository} from '@/modules/tenancy/infrastructure/admin-onboarding.repository';
import {authorizeAdminOnboarding,executeAdminOnboarding,type AdminOnboardingCommand} from '@/modules/tenancy/application/admin-onboarding';
import type {UUID} from '@/shared/types';
import {MEMBER_INVITATION_ROLES,type MemberInvitationRole} from '@/modules/tenancy/domain/member-invitation';
export const dynamic='force-dynamic';
type Context={params:Promise<{projectId:string}>};

export async function GET(req:NextRequest,ctx:Context) {try {
  const auth=await requireActiveAuth(req),{projectId}=await ctx.params;
  requireResourceUuid(projectId,'projectId');
  const authority=await assertProjectAdministrator(pool,auth,projectId as UUID);
  const search=req.nextUrl.searchParams.get('search')??'',companySearch=req.nextUrl.searchParams.get('companySearch')??'';
  const offset=Number(req.nextUrl.searchParams.get('offset')??0);
  if(search.length>100||companySearch.length>100||!Number.isSafeInteger(offset)||offset<0)throw new ValidationError('Invalid employee search page');
  const repo=new AdminOnboardingRepository();
  const [page,companies,invitations,tenantCompanies,administrators]=await Promise.all([
    repo.employees(pool,auth.tenantId,projectId as UUID,authority.centralIT,search,offset),
    repo.companies(pool,auth.tenantId,projectId as UUID,authority.centralIT,companySearch),
    repo.invitations(pool,auth.tenantId,projectId as UUID),
    repo.tenantCompanies(pool,auth.tenantId,projectId as UUID,authority.centralIT),
    repo.administrators(pool,auth.tenantId,projectId as UUID),
  ]);
  return NextResponse.json({...page,companies,tenantCompanies,administrators,invitations:invitations.map(({token,...invite})=>({...invite,
    registrationPath:token?`/register?${new URLSearchParams({tenantId:auth.tenantId,email:invite.email,inviteToken:token})}`:null}))},
    {headers:{'Cache-Control':'private, no-store'}});
}catch(error){return errorResponse(error);}}

function parseCommand(body:unknown):AdminOnboardingCommand {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ValidationError('Review and confirm this action');
  const b=body as Record<string,unknown>;
  const keys=b.action==='GRANT'?['action','userId','companyId','expectedRole','confirmed']:b.action==='INVITE'?['action','companyId','email','purpose','role','confirmed']:['action','inviteId','confirmed'];
  if(b.confirmed!==true||Object.keys(b).some(key=>!keys.includes(key)))throw new ValidationError('Confirm the reviewed onboarding action');
  if(b.action==='GRANT'&&typeof b.userId==='string'&&typeof b.companyId==='string'&&(b.expectedRole===null||typeof b.expectedRole==='string'&&b.expectedRole.length<=80)) {
    requireResourceUuid(b.userId,'userId');requireResourceUuid(b.companyId,'companyId');
    return {action:'GRANT',userId:b.userId as UUID,companyId:b.companyId as UUID,expectedRole:b.expectedRole as string|null,confirmed:true};
  }
  if(b.action==='CANCEL_INVITE'&&typeof b.inviteId==='string') {requireResourceUuid(b.inviteId,'inviteId');return {action:'CANCEL_INVITE',inviteId:b.inviteId as UUID,confirmed:true};}
  if(b.action==='INVITE'&&typeof b.companyId==='string'&&typeof b.email==='string') {
    requireResourceUuid(b.companyId,'companyId');const email=b.email.trim().toLowerCase();
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ValidationError('Enter a valid employee email');
    if(b.purpose!==undefined&&b.purpose!=='PROJECT_ADMIN'&&b.purpose!=='EMPLOYEE')throw new ValidationError('Choose the invitation purpose');
    if(b.role!==undefined&&(typeof b.role!=='string'||!MEMBER_INVITATION_ROLES.includes(b.role as MemberInvitationRole)))throw new ValidationError('Choose a supported operational role');
    if(b.role!==undefined&&b.purpose!=='EMPLOYEE'&&b.role!=='REQUESTER')throw new ValidationError('Project Admin invitations start with Requester membership');
    return {action:'INVITE',companyId:b.companyId as UUID,email,...(b.purpose?{purpose:b.purpose}:{}),...(b.role?{role:b.role as MemberInvitationRole}:{}),confirmed:true};
  }
  throw new ValidationError('Choose an employee or an employee invitation');
}
export async function POST(req:NextRequest,ctx:Context) {try {
  const auth=await requireActiveAuth(req),{projectId}=await ctx.params;requireResourceUuid(projectId,'projectId');
  const command=parseCommand(await readJsonBody(req)),key=requireIdempotencyKey(req);
  const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{
    tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST /api/projects/${projectId}/admin-onboarding`,idempotencyKey:key,
  },command,async()=>({status:200,body:await executeAdminOnboarding(db,auth,projectId as UUID,command)})),
    {req,auth,mode:'EXCLUSIVE',authorize:async(db,current)=>{await authorizeAdminOnboarding(db,current,projectId as UUID);}});
  return NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store'}});
}catch(error){return errorResponse(error);}}
