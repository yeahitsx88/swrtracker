import {InternalError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {InvitationHistoryQuery,ProjectInvitationHistory,ProjectInvitationRecord} from '../application/project-invitation-history';
interface Row {id:string|null;email:string;role:ProjectInvitationRecord['role'];company_id:string;company_name:string;state:ProjectInvitationRecord['state'];created_at:Date;expires_at:Date;accepted_at:Date|null;canceled_at:Date|null;project_status:string;cancellation_id:string|null;witnessed:boolean;total:string;observed_at:Date}
/** Current Central IT/session and SHARED tenant barrier are held by the read route. Never select bearer tokens. */
export async function readProjectInvitationHistory(db:DbClient,tenantId:UUID,projectId:UUID,query:InvitationHistoryQuery):Promise<ProjectInvitationHistory>{
 const {rows}=await db.query<Row>(`WITH checked AS (SELECT clock_timestamp() AS observed_at), records AS (
  SELECT i.id,i.email,i.role,i.company_id,c.name AS company_name,i.created_at,i.expires_at,i.accepted_at,i.canceled_at,p.status AS project_status,
   pc.id AS cancellation_id,EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(pc.reviewed_evidence->'invitations','[]'::jsonb)) w WHERE w->>'id'=i.id::text) AS witnessed,
   CASE WHEN i.accepted_at IS NOT NULL THEN 'ACCEPTED' WHEN i.canceled_at IS NOT NULL THEN 'CANCELLED' WHEN i.expires_at<=checked.observed_at THEN 'EXPIRED' ELSE 'PENDING' END AS state
  FROM invites i JOIN companies c ON c.tenant_id=i.tenant_id AND c.id=i.company_id
  JOIN projects p ON p.tenant_id=i.tenant_id AND p.id=i.project_id CROSS JOIN checked
  LEFT JOIN project_preparation_cancellations pc ON pc.tenant_id=p.tenant_id AND pc.project_id=p.id AND pc.completed_at IS NULL
  WHERE i.tenant_id=$1 AND i.project_id=$2
 ), filtered AS (SELECT * FROM records WHERE ($3='ALL' OR $3='HISTORY' AND state<>'PENDING' OR state=$3)
  AND ($4='' OR position(lower($4) in lower(concat_ws(' ',email,company_name,role::text)))>0))
 SELECT page.*,totals.total,checked.observed_at FROM (SELECT count(*)::text AS total FROM filtered) totals CROSS JOIN checked
 LEFT JOIN LATERAL (SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT $5 OFFSET $6) page ON true`,[tenantId,projectId,query.state,query.search,query.limit,query.offset]);
 const totals=rows[0];if(!totals)throw new InternalError('Invitation history aggregate unavailable');
 return {data:rows.filter(row=>row.id!==null).map(row=>({id:row.id!,email:row.email,role:row.role,companyId:row.company_id,companyName:row.company_name,state:row.state,createdAt:row.created_at.toISOString(),expiresAt:row.expires_at.toISOString(),acceptedAt:row.accepted_at?.toISOString()??null,canceledAt:row.canceled_at?.toISOString()??null,canCancel:row.state==='PENDING'&&row.project_status!=='ARCHIVED'&&(!row.cancellation_id||row.witnessed)})),total:Number(totals.total),limit:query.limit,offset:query.offset,observedAt:totals.observed_at.toISOString()};
}
