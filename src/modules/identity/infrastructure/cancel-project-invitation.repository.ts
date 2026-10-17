import {createHash} from 'node:crypto';
import {ConflictError,NotFoundError} from '@/shared/errors';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import type {AuthContext} from '@/lib/auth';
import type {DbClient,UUID} from '@/shared/types';
import type {InvitationCancellationRepository,InvitationCancellationPreview,InvitationCancellationCommand} from '../application/cancel-project-invitation';
interface Row {id:string;email:string;role:string;company_name:string;expires_at:Date;accepted_at:Date|null;canceled_at:Date|null;created_at:Date;status:string;pending:boolean;cancellation_id:string|null;recommissioning_id:string|null;witnessed:boolean;company_id:string}
export class SqlInvitationCancellationRepository implements InvitationCancellationRepository {
 async preview(db:DbClient,auth:AuthContext,projectId:UUID,inviteId:UUID):Promise<InvitationCancellationPreview>{
  const {rows}=await db.query<Row>(`SELECT i.id,i.email,i.role,c.name AS company_name,i.company_id,i.expires_at,i.accepted_at,i.canceled_at,i.created_at,p.status,
   i.accepted_at IS NULL AND i.canceled_at IS NULL AND i.expires_at>clock_timestamp() AS pending,
   rc.id AS recommissioning_id,pc.id AS cancellation_id,EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(pc.reviewed_evidence->'invitations','[]'::jsonb)) w WHERE w->>'id'=i.id::text) AS witnessed
   FROM invites i JOIN projects p ON p.tenant_id=i.tenant_id AND p.id=i.project_id
   JOIN companies c ON c.tenant_id=i.tenant_id AND c.id=i.company_id
   LEFT JOIN project_recommissioning rc ON rc.tenant_id=i.tenant_id AND rc.project_id=i.project_id AND rc.opened_at IS NULL AND rc.cancelled_at IS NULL
   LEFT JOIN project_preparation_cancellations pc ON pc.tenant_id=i.tenant_id AND pc.project_id=i.project_id AND pc.completed_at IS NULL
   WHERE i.tenant_id=$1 AND i.project_id=$2 AND i.id=$3`,[auth.tenantId,projectId,inviteId]);
  const r=rows[0];if(!r)throw new NotFoundError('Invitation not found');
  const publicRecord={id:r.id,email:r.email,role:r.role,companyName:r.company_name,expiresAt:r.expires_at.toISOString(),acceptedAt:r.accepted_at?.toISOString()??null,canceledAt:r.canceled_at?.toISOString()??null,projectStatus:r.status};
  const snapshot=createHash('sha256').update(JSON.stringify({tenantId:auth.tenantId,projectId,...publicRecord,companyId:r.company_id,createdAt:r.created_at.toISOString(),cancellationId:r.cancellation_id,recommissioningId:r.recommissioning_id,witnessed:r.witnessed})).digest('hex');
  return {...publicRecord,canCancel:r.pending&&r.status!=='ARCHIVED'&&(!r.cancellation_id||r.witnessed),snapshot};
 }
 async cancel(db:DbClient,auth:AuthContext,projectId:UUID,inviteId:UUID,command:InvitationCancellationCommand,preview:InvitationCancellationPreview){
  const {rows}=await db.query<{canceled_at:Date}>(`UPDATE invites SET canceled_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at>clock_timestamp() RETURNING canceled_at`,[auth.tenantId,projectId,inviteId]);
  if(!rows[0])throw new ConflictError('Invitation is no longer pending. Reload and review before acting.','INVITATION_NOT_PENDING');
  const canceledAt=rows[0].canceled_at.toISOString();
  await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:null,eventType:'invite.canceled',authorityEvidence:{capability:'CENTRAL_IT'},changes:{inviteId,canceled_by:auth.userId,original_role:preview.role,original_email:preview.email,canceledAt,reason:command.reason,snapshot:command.snapshot}});
  return {inviteId,canceledAt};
 }
}
