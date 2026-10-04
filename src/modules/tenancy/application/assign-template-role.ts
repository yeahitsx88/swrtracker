import type {AuthContext} from '@/lib/auth';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import {ConflictError,NotFoundError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import {resolveCustomRoleSelection} from './custom-roles';
import type {CustomRoleBase} from '../domain/custom-role';

/** Only Requester/Viewer transitions: survey changes keep their established obligation checks. */
export async function assignTemplateRole(db:DbClient,auth:AuthContext,projectId:UUID,userId:UUID,input:{role:CustomRoleBase;customRoleId?:UUID;customRoleVersion?:number;sessionVersion:number}){
  const authority=await assertProjectAdministrator(db,auth,projectId);
  const member=(await db.query<{role:string;custom_role_id:UUID|null;session_version:number;type:string;status:string;deactivated_at:Date|null;access_disabled_at:Date|null}>(
    `SELECT pm.role,pm.custom_role_id,u.session_version,c.type,p.status,u.deactivated_at,pm.access_disabled_at
     FROM project_memberships pm JOIN projects p ON p.id=pm.project_id JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
     JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
     WHERE p.tenant_id=$1 AND pm.project_id=$2 AND pm.user_id=$3 FOR UPDATE OF pm,u`,[auth.tenantId,projectId,userId])).rows[0];
  if(!member)throw new NotFoundError('Project member not found.');
  if(member.status==='ARCHIVED'||member.deactivated_at||member.access_disabled_at)throw new ConflictError('Only active members of an open project can receive a role.');
  if(member.session_version!==input.sessionVersion)throw new ConflictError('This member changed. Reload and review their current access.');
  if(!['REQUESTER','VIEWER'].includes(member.role))throw new ValidationError('Survey role changes require the survey staffing workflow and obligation checks.');
  if(member.type==='SUBCONTRACTOR'&&input.role!=='REQUESTER')throw new ValidationError('Subcontractor accounts receive Requester access only.');
  const role=await resolveCustomRoleSelection(db,auth.tenantId,input);
  await db.query('UPDATE project_memberships SET role=$3,custom_role_id=$4 WHERE project_id=$1 AND user_id=$2',[projectId,userId,input.role,role?.id??null]);
  await db.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[auth.tenantId,userId]);
  await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:userId,eventType:'project.role_changed',authorityEvidence:{centralIT:authority.centralIT},changes:{previous:{role:member.role,customRoleId:member.custom_role_id},role:input.role,customRole:role,sessionRenewalRequired:true}});
  return {assigned:true,sessionRenewalRequired:true};
}
