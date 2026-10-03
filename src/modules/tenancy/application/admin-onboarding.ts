import type {DbClient,UUID} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {ConflictError,NotFoundError} from '@/shared/errors';
import {AdminOnboardingRepository} from '../infrastructure/admin-onboarding.repository';
import {registerProjectCompany,setProjectAdministrator} from './project-administration';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import type {MemberInvitationRole} from '../domain/member-invitation';

export type AdminOnboardingCommand=
  | {action:'GRANT';userId:UUID;companyId:UUID;expectedRole:string|null;confirmed:true}
  | {action:'INVITE';companyId:UUID;email:string;purpose?:'PROJECT_ADMIN'|'EMPLOYEE';expectedHomeCompanyId?:UUID;role?:MemberInvitationRole;confirmed:true}
  | {action:'CANCEL_INVITE';inviteId:UUID;confirmed:true};

export async function authorizeAdminOnboarding(db:DbClient,auth:AuthContext,projectId:UUID) {
  const authority=await assertProjectAdministrator(db,auth,projectId);
  const project=(await db.query<{status:string}>('SELECT status FROM projects WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[auth.tenantId,projectId])).rows[0];
  if(!project)throw new NotFoundError('Project not found');
  if(project.status==='ARCHIVED')throw new ConflictError('Archived projects are read-only');
  return authority;
}

/** Caller owns transaction and tenant barrier; no auto-grant on invitation acceptance. */
export async function executeAdminOnboarding(db:DbClient,auth:AuthContext,projectId:UUID,command:AdminOnboardingCommand) {
  const authority=await authorizeAdminOnboarding(db,auth,projectId);
  const repo=new AdminOnboardingRepository();
  if(command.action==='GRANT') {
    const employee=await repo.eligibleEmployee(db,auth.tenantId,projectId,command.userId,authority.centralIT);
    if(!employee)throw new NotFoundError('Eligible active employee not found');
    if(employee.disabledAt)throw new ConflictError('Disabled project access must be reviewed separately');
    if(employee.companyId!==command.companyId||employee.role!==command.expectedRole)throw new ConflictError('Employee company or project role changed. Reload onboarding and review the current employee.');
    await registerProjectCompany(db,auth,projectId,{companyId:employee.companyId});
    if(!employee.role) {
      if(!await repo.addRequesterMembership(db,projectId,command.userId))throw new ConflictError('Project membership changed. Reload onboarding and review the employee again.');
      await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:command.userId,eventType:'project.member_added',
        authorityEvidence:{centralIT:authority.centralIT},changes:{role:'REQUESTER',source:'ADMIN_ONBOARDING'}});
    }
    const result=await setProjectAdministrator(db,auth,projectId,command.userId,true);
    return {action:'GRANT' as const,...result,signInRenewal:command.userId===auth.userId};
  }
  if(command.action==='CANCEL_INVITE') {
    if(!await repo.cancelInvitation(db,auth.tenantId,projectId,command.inviteId))throw new ConflictError('This invitation is no longer pending. Refresh invitations.');
    await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:null,eventType:'user.invitation_canceled',
      authorityEvidence:{centralIT:authority.centralIT},changes:{inviteId:command.inviteId,source:'ADMIN_ONBOARDING'}});
    return {action:'CANCEL_INVITE' as const};
  }
  if(command.expectedHomeCompanyId){const home=(await db.query<{id:UUID}>('SELECT home_company_id AS id FROM tenants WHERE id=$1',[auth.tenantId])).rows[0];if(home?.id!==command.expectedHomeCompanyId||command.companyId!==home.id)throw new ConflictError('Tenant home organization changed. Reload the invitation and review its company.');}
  if(!await repo.eligibleCompany(db,auth.tenantId,projectId,command.companyId,authority.centralIT))throw new NotFoundError('Eligible employee company not found');
  if(await repo.existingAccount(db,auth.tenantId,command.email))throw new ConflictError('This person already has a tenant account. Select the existing employee instead. Disabled accounts require a separate review.');
  const pending=await repo.pendingInvitation(db,auth.tenantId,projectId,command.email);
  if(pending&&pending.companyId!==command.companyId)throw new ConflictError('A pending invitation uses another company. Cancel it before choosing a different company.');
  if(pending&&pending.purpose!==(command.purpose??'PROJECT_ADMIN'))throw new ConflictError('A pending invitation has another purpose. Review that invitation before creating a new one.');
  const role=command.purpose==='EMPLOYEE'?command.role??'REQUESTER':'REQUESTER';
  if(pending&&pending.role!==role)throw new ConflictError('A pending invitation has another operational role. Cancel it before selecting a different role.');
  await registerProjectCompany(db,auth,projectId,{companyId:command.companyId});
  const invite=pending??await repo.createInvitation(db,auth.tenantId,projectId,command.companyId,command.email,auth.userId,role);
  if(!invite)throw new ConflictError('Unable to create invitation. Reload and review the employee details.');
  if(!pending)await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:null,eventType:'user.invited',
    authorityEvidence:{centralIT:authority.centralIT},changes:{inviteId:invite.id,companyId:command.companyId,email:command.email,role,purpose:command.purpose??'PROJECT_ADMIN',adminGranted:false,source:'ADMIN_ONBOARDING'}});
  return {action:'INVITE' as const,inviteId:invite.id};
}
