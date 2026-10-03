import {randomUUID} from 'node:crypto';
import type {AuthContext} from '@/lib/auth';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {acquireTenantLifecycleLock} from '@/lib/tenant-lifecycle-lock';
import type {DbClient,UUID} from '@/shared/types';
import {ConflictError,NotFoundError,ValidationError} from '@/shared/errors';
import type {Company,CompanyType} from '../domain/types';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';

async function authorizeWritable(db:DbClient,auth:AuthContext,projectId:UUID){
  await acquireTenantLifecycleLock(db,auth.tenantId,'EXCLUSIVE');
  const authority=await assertProjectAdministrator(db,auth,projectId);
  const project=(await db.query<{status:string;activated_at:Date|null}>('SELECT status,activated_at FROM projects WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[auth.tenantId,projectId])).rows[0];
  if(!project)throw new NotFoundError('Project not found');
  if(project.status==='ARCHIVED')throw new ConflictError('Archived projects are read-only');
  return {authority,project};
}
export async function setProjectAdministrator(db:DbClient,auth:AuthContext,projectId:UUID,subjectUserId:UUID,enabled:boolean):Promise<{changed:boolean}>{
  const {authority}=await authorizeWritable(db,auth,projectId);
  const member=(await db.query(`SELECT u.id FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
    JOIN project_memberships pm ON pm.user_id=u.id AND pm.project_id=$2 WHERE u.tenant_id=$1 AND u.id=$3
    AND u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL AND c.type IN ('GC','OWNER_REP')`,[auth.tenantId,projectId,subjectUserId])).rows[0];
  if(!member)throw new NotFoundError('Eligible active project member not found');
  const {rows}=enabled?await db.query(`INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by)
    VALUES($1,$2,$3,'EXPLICIT',$4) ON CONFLICT DO NOTHING RETURNING id`,[auth.tenantId,projectId,subjectUserId,auth.userId]):
    await db.query(`UPDATE project_admin_grants SET revoked_at=NOW(),revoked_by=$4 WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND revoked_at IS NULL RETURNING id`,[auth.tenantId,projectId,subjectUserId,auth.userId]);
  if(!rows[0])return {changed:false};
  await db.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[auth.tenantId,subjectUserId]);
  await appendAdministrativeEvent(db,{auth,projectId,subjectUserId,eventType:enabled?'project.admin_granted':'project.admin_revoked',
    authorityEvidence:{centralIT:authority.centralIT,actorId:auth.userId},changes:{grantId:rows[0].id,enabled,operationalRolePreserved:true}});
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
    row=(await db.query<typeof row & object>('INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,$3,$4) RETURNING id,tenant_id,name,type,created_at',[randomUUID(),auth.tenantId,name,input.type])).rows[0];
  }
  if(!row)throw new NotFoundError('Company not found');
  const association=await db.query(`INSERT INTO project_companies(tenant_id,project_id,company_id,associated_by) VALUES($1,$2,$3,$4)
    ON CONFLICT DO NOTHING RETURNING company_id`,[auth.tenantId,projectId,row.id,auth.userId]);
  if(association.rows[0])await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:null,eventType:created?'project.company_registered':'project.company_associated',
    authorityEvidence:{centralIT:authority.centralIT},changes:{companyId:row.id,name:row.name,type:row.type,associationScope:projectId}});
  return {id:row.id,tenantId:row.tenant_id,name:row.name,type:row.type,createdAt:row.created_at};
}
export async function selectProjectTemplate(db:DbClient,auth:AuthContext,projectId:UUID,templateId:UUID):Promise<void>{
  const {authority,project}=await authorizeWritable(db,auth,projectId);
  if(project.status!=='SETUP'||project.activated_at!=null||(await db.query('SELECT id FROM project_recommissioning WHERE tenant_id=$1 AND project_id=$2 AND opened_at IS NULL',[auth.tenantId,projectId])).rows.length)throw new ConflictError('Template selection is locked after activation');
  const template=(await db.query<{id:UUID;crew_build:string}>('SELECT id,crew_build FROM project_templates WHERE tenant_id=$1 AND id=$2',[auth.tenantId,templateId])).rows[0];
  if(!template)throw new NotFoundError('Template not found');
  await db.query('UPDATE projects SET template_id=$3,crew_build=$4 WHERE tenant_id=$1 AND id=$2',[auth.tenantId,projectId,templateId,template.crew_build]);
  await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:null,eventType:'project.configuration_changed',authorityEvidence:{centralIT:authority.centralIT},
    changes:{resource:'TEMPLATE_SELECTION',templateId,crewBuild:template.crew_build,existingSetupPreserved:true}});
}
