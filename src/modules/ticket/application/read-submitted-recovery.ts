import type {DbClient,UUID} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import type {SubmittedRecoveryRecord,SubmittedRecoveryPage} from '@/lib/contracts/submitted-recovery';
import {authorizeRecoveryActor,recoveryVisibility} from './submitted-recovery-access';

export const requesterCanCorrectSql=`EXISTS(SELECT 1 FROM users ru JOIN companies rc ON rc.tenant_id=ru.tenant_id AND rc.id=ru.company_id JOIN project_memberships rm ON rm.user_id=ru.id AND rm.project_id=t.project_id WHERE ru.tenant_id=t.tenant_id AND ru.id=t.requester_id AND ru.deactivated_at IS NULL AND rm.access_disabled_at IS NULL AND rm.role='REQUESTER')`;
export async function readSubmittedRecovery(db:DbClient,auth:AuthContext,projectId:UUID,limit:number,offset:number):Promise<SubmittedRecoveryPage>{
 const actor=await authorizeRecoveryActor(db,auth,projectId);
 const where=`t.tenant_id=$1 AND t.project_id=$2 AND t.draft_deleted_at IS NULL AND t.ticket_number IS NOT NULL AND t.first_submitted_at IS NOT NULL AND t.status IN ('REJECTED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED') AND (${recoveryVisibility(actor)})`;
 const params=[auth.tenantId,projectId,auth.userId];
 const total=Number((await db.query<{total:string}>(`SELECT count(*) AS total FROM tickets t WHERE ${where}`,params)).rows[0]?.total??0);
 const rows=(await db.query<{id:string;ticket_number:string;description:string;requester_name:string;area_name:string|null;status:SubmittedRecoveryRecord['status'];row_version:number;first_submitted_at:Date;requester_enabled:boolean}>(`SELECT t.id,t.ticket_number,t.description,u.name AS requester_name,n.name AS area_name,t.status,t.row_version,t.first_submitted_at,${requesterCanCorrectSql} AS requester_enabled FROM tickets t JOIN users u ON u.tenant_id=t.tenant_id AND u.id=t.requester_id LEFT JOIN aor_nodes n ON n.tenant_id=t.tenant_id AND n.project_id=t.project_id AND n.id=t.aor_node_id WHERE ${where} ORDER BY t.updated_at DESC,t.id LIMIT $4 OFFSET $5`,[...params,limit,offset])).rows;
 const readOnly=actor.projectStatus!=='ACTIVE'||actor.preparing;
 return {total,limit,offset,readOnly,data:rows.map(r=>({id:r.id,ticketNumber:r.ticket_number,description:r.description,requesterName:r.requester_name,areaName:r.area_name,status:r.status,rowVersion:r.row_version,firstSubmittedAt:r.first_submitted_at.toISOString(),canRecover:!readOnly&&r.requester_enabled,blocker:readOnly?'Reopen the project before recovering submitted work.':!r.requester_enabled?'Restore the original requester’s eligible project access before recovery.':null}))};
}
