import {SurveyTeamsPgRepository} from '../infrastructure/survey-teams.repository';
import {assertResolvedSurveyRoleObligations} from './change-survey-role';
import {assertCompanyNameAvailable} from '../infrastructure/company-name-availability';
import {randomUUID} from 'node:crypto';
import type {AuthContext} from '@/lib/auth';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {assertPreparationNotCancelling} from '@/lib/recommissioning-gate';
import {acquireTenantLifecycleLock} from '@/lib/tenant-lifecycle-lock';
import type {DbClient,UUID} from '@/shared/types';
import {ConflictError,ForbiddenError,NotFoundError,ValidationError} from '@/shared/errors';
import type {Company,CompanyType} from '../domain/types';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import {readProjectCompanies} from '../infrastructure/project-companies.reader';

export async function authorizeWritable(db:DbClient,auth:AuthContext,projectId:UUID){
  await acquireTenantLifecycleLock(db,auth.tenantId,'EXCLUSIVE');
  const authority=await assertProjectAdministrator(db,auth,projectId);
  const project=(await db.query<{status:string;activated_at:Date|null}>('SELECT status,activated_at FROM projects WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[auth.tenantId,projectId])).rows[0];
  if(!project)throw new NotFoundError('Project not found');
  if(project.status==='ARCHIVED')throw new ConflictError('Archived projects are read-only');
  await assertPreparationNotCancelling(db,auth.tenantId,projectId);
  return {authority,project};
}
/**
 * Decision 57 / D1: a grant either keeps the person's operational role (KEEP_ROLE, the
 * established default) or makes them Project Admin only (ADMIN_ONLY). The role is removed
 * only when nothing depends on it: the survey role obligations (UAR-026), named-team
 * membership, Survey Manager continuity and their own open requests and drafts.
 */
export type ProjectAdminScope='KEEP_ROLE'|'ADMIN_ONLY';
const TERMINAL_STATUSES=['COMPLETED','REJECTED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED'];
async function makeAdministratorOnly(db:DbClient,auth:AuthContext,projectId:UUID,subjectUserId:UUID):Promise<string|null>{
  const repo=new SurveyTeamsPgRepository();
  const [member]=await repo.members(db,auth.tenantId,projectId,[subjectUserId]);
  if(!member?.active)throw new NotFoundError('Eligible active project member not found');
  if(member.role==='PROJECT_ADMIN')return null;
  if(subjectUserId===auth.userId)throw new ForbiddenError('Another Tenant Admin must remove your operational role');
  assertResolvedSurveyRoleObligations(await repo.roleObligations(db,auth.tenantId,projectId,subjectUserId));
  if(member.teamId)throw new ConflictError('Resolve named-team membership in Team Management before making this person Project Admin only','SURVEY_TEAM_MEMBERSHIP_OBLIGATION');
  if(member.role==='SURVEY_MANAGER'&&!await repo.anotherCurrentManager(db,auth.tenantId,projectId,subjectUserId))throw new ConflictError('Appoint a permanent replacement Survey Manager before making this Manager Project Admin only','LAST_SURVEY_MANAGER');
  const open=(await db.query<{count:number}>(`SELECT count(*)::int AS count FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND requester_id=$3
    AND draft_deleted_at IS NULL AND status<>ALL($4::text[])`,[auth.tenantId,projectId,subjectUserId,TERMINAL_STATUSES])).rows[0]?.count??0;
  if(open)throw new ConflictError(`This person still has ${open} open request(s) or draft(s) of their own. Finish, cancel or delete them, or keep their current role.`,'REQUESTER_WORK_OBLIGATION');
  const changed=await db.query('UPDATE project_memberships SET role=$4,custom_role_id=NULL WHERE project_id=$1 AND user_id=$2 AND role=$3 AND access_disabled_at IS NULL RETURNING user_id',[projectId,subjectUserId,member.role,'PROJECT_ADMIN']);
  if(!changed.rows[0])throw new ConflictError('This person’s role changed; reload and review again','STALE_SURVEY_ROLE');
  return member.role;
}
export async function setProjectAdministrator(db:DbClient,auth:AuthContext,projectId:UUID,subjectUserId:UUID,enabled:boolean,scope:ProjectAdminScope='KEEP_ROLE'):Promise<{changed:boolean}>{
  const {authority}=await authorizeWritable(db,auth,projectId);
  if(!authority.centralIT)throw new ForbiddenError('Only Tenant Admin can assign or revoke Project Admin authority.');
  const member=(await db.query(`SELECT u.id FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
    JOIN project_memberships pm ON pm.user_id=u.id AND pm.project_id=$2 WHERE u.tenant_id=$1 AND u.id=$3
    AND u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL AND c.type IN ('GC','OWNER_REP')`,[auth.tenantId,projectId,subjectUserId])).rows[0];
  if(!member)throw new NotFoundError('Eligible active project member not found');
  if(!enabled&&scope!=='KEEP_ROLE')throw new ValidationError('Revoking Project Admin does not change the operational role');
  const previousRole=enabled&&scope==='ADMIN_ONLY'?await makeAdministratorOnly(db,auth,projectId,subjectUserId):null;
  const {rows}=enabled?await db.query(`INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by)
    VALUES($1,$2,$3,'EXPLICIT',$4) ON CONFLICT DO NOTHING RETURNING id`,[auth.tenantId,projectId,subjectUserId,auth.userId]):
    await db.query(`UPDATE project_admin_grants SET revoked_at=NOW(),revoked_by=$4 WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND revoked_at IS NULL RETURNING id`,[auth.tenantId,projectId,subjectUserId,auth.userId]);
  if(!rows[0]&&!previousRole)return {changed:false};
  await db.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[auth.tenantId,subjectUserId]);
  if(rows[0])await appendAdministrativeEvent(db,{auth,projectId,subjectUserId,eventType:enabled?'project.admin_granted':'project.admin_revoked',
    authorityEvidence:{centralIT:authority.centralIT,actorId:auth.userId},changes:{grantId:rows[0].id,enabled,operationalRolePreserved:!previousRole,...(previousRole?{scope,previousRole,role:'PROJECT_ADMIN'}:{})}});
  else await appendAdministrativeEvent(db,{auth,projectId,subjectUserId,eventType:'project.role_changed',
    authorityEvidence:{centralIT:authority.centralIT},changes:{previousRole,role:'PROJECT_ADMIN',scope,existingProjectAdminGrant:true,confirmed:true,sessionRenewalRequired:true}});
  return {changed:true};
}
export async function registerProjectCompany(db:DbClient,auth:AuthContext,projectId:UUID,input:{name:string;type:CompanyType}|{companyId:UUID}):Promise<Company>{
  const {authority}=await authorizeWritable(db,auth,projectId);
  let row:{id:UUID;tenant_id:UUID;name:string;type:CompanyType;created_at:Date}|undefined;
  const created=!('companyId' in input);
  if('companyId' in input){row=(await db.query<typeof row & object>('SELECT id,tenant_id,name,type,created_at FROM companies WHERE tenant_id=$1 AND id=$2',[auth.tenantId,input.companyId])).rows[0];}
  else{
    const name=input.name.trim();
    if(!name||name.length>200||!['GC','SUBCONTRACTOR','OWNER_REP'].includes(input.type))throw new ValidationError('A company name and valid type are required');
    await assertCompanyNameAvailable(db,auth.tenantId,name);
    row=(await db.query<typeof row & object>('INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,$3,$4) RETURNING id,tenant_id,name,type,created_at',[randomUUID(),auth.tenantId,name,input.type])).rows[0];
  }
  if(!row)throw new NotFoundError('Company not found');
  const association=await db.query(`INSERT INTO project_companies(tenant_id,project_id,company_id,associated_by) VALUES($1,$2,$3,$4)
    ON CONFLICT DO NOTHING RETURNING company_id`,[auth.tenantId,projectId,row.id,auth.userId]);
  if(association.rows[0])await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:null,eventType:created?'project.company_registered':'project.company_associated',
    authorityEvidence:{centralIT:authority.centralIT},changes:{companyId:row.id,name:row.name,type:row.type,associationScope:projectId}});
  return {id:row.id,tenantId:row.tenant_id,name:row.name,type:row.type,createdAt:row.created_at};
}
/** Establishment selects the template in createProject. Existing projects require
 * a separately governed Central migration; legacy retries cannot grant that power. */
export async function selectProjectTemplate(db:DbClient,auth:AuthContext,projectId:UUID,_templateId:UUID):Promise<void>{
  const {authority}=await authorizeWritable(db,auth,projectId);
  if(!authority.centralIT)throw new ForbiddenError('Project Admin cannot change the established project template.');
  throw new ConflictError('The established project template is locked. Central template revisions apply to future projects; adoption requires a separately governed migration.','PROJECT_TEMPLATE_LOCKED');
}

/** Remove only the reviewed project associations; tenant companies and all history remain. */
export async function removeProjectCompanies(db:DbClient,auth:AuthContext,projectId:UUID,selected:Array<{id:UUID;associatedAt:string}>):Promise<{removed:number}>{
  const {authority}=await authorizeWritable(db,auth,projectId);
  const current=await readProjectCompanies(db,auth.tenantId,projectId);
  const records=selected.map(selection=>{
    const company=current.find(c=>c.id===selection.id);
    if(!company)throw new ConflictError('A selected company is no longer associated with this project. Reload companies and review again.');
    if(company.associatedAt!==selection.associatedAt)throw new ConflictError('A selected company association changed. Reload companies and review again.');
    if(company.members||company.invitations||company.grants)throw new ConflictError(`${company.name} still has ${company.members} enabled project membership(s), ${company.invitations} pending invitation(s) and ${company.grants} active authority grant(s). Resolve these before removing the company. No selected companies were removed.`);
    return company;
  });
  // All selected dependencies pass before any effect; the held EXCLUSIVE barrier serializes access writers.
  await db.query('DELETE FROM project_companies WHERE tenant_id=$1 AND project_id=$2 AND company_id=ANY($3::uuid[])',[auth.tenantId,projectId,records.map(c=>c.id)]);
  for(const company of records)await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:null,eventType:'project.company_removed',
    authorityEvidence:{centralIT:authority.centralIT},changes:{companyId:company.id,name:company.name,type:company.type,associatedAt:company.associatedAt,associatedBy:company.associatedBy,associationScope:projectId,tenantCompanyPreserved:true,historyPreserved:true}});
  return {removed:records.length};
}
