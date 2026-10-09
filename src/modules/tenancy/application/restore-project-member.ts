import type {AuthContext} from '@/lib/auth';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import {ConflictError,NotFoundError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
/** Restore retained membership only. Revoked independent grants and removed staffing stay revoked. */
export async function restoreProjectMember(db:DbClient,auth:AuthContext,projectId:UUID,userId:UUID,input:{sessionVersion:number;disabledAt:string;reason:string}){
 const authority=await assertProjectAdministrator(db,auth,projectId);
 const member=(await db.query<{role:string;session_version:number;disabled_at:string|null;deactivated_at:Date|null;status:string;associated:boolean;company_type:string}>(`SELECT pm.role,u.session_version,
  pm.access_disabled_at::text AS disabled_at,u.deactivated_at,p.status,c.type AS company_type,
  EXISTS(SELECT 1 FROM project_companies pc WHERE pc.tenant_id=p.tenant_id AND pc.project_id=p.id AND pc.company_id=u.company_id) AS associated
  FROM project_memberships pm JOIN projects p ON p.id=pm.project_id JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
  JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
  WHERE p.tenant_id=$1 AND p.id=$2 AND u.id=$3 FOR UPDATE OF pm,u`,[auth.tenantId,projectId,userId])).rows[0];
 if(!member)throw new NotFoundError('Removed project member not found.');
 if(member.deactivated_at)throw new ConflictError('The tenant account is disabled. Contact Tenant Admin before restoring project access.');
 if(member.status==='ARCHIVED')throw new ConflictError('Archived project access cannot be restored.');
 if(!member.associated)throw new ConflictError('Associate this member’s company on Companies before restoring access.');
 if(member.company_type==='SUBCONTRACTOR'&&member.role!=='REQUESTER')throw new ConflictError('Subcontractor access must be Requester. Resolve the retained role before restoring access.');
 if(member.session_version!==input.sessionVersion||member.disabled_at!==input.disabledAt)throw new ConflictError('This access record changed. Reload and review the removal again.');
 if(input.reason.trim().length<10||input.reason.length>1000)throw new ValidationError('Give a restoration reason of 10–1000 characters.');
 await db.query('UPDATE project_memberships SET access_disabled_at=NULL,access_disabled_by=NULL WHERE project_id=$1 AND user_id=$2',[projectId,userId]);
 await db.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[auth.tenantId,userId]);
 await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:userId,eventType:'project.access_restored',authorityEvidence:{centralIT:authority.centralIT},changes:{previousDisabledAt:member.disabled_at,role:member.role,reason:input.reason.trim(),independentGrantsRestored:false,staffingRestored:false,sessionRenewalRequired:true}});
 return {restored:true,role:member.role,sessionRenewalRequired:true};
}
