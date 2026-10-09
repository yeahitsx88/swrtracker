import {ConflictError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
/** Tenant barrier must be held. This guard limits operations; it supplies no authority. */
export async function assertPreparationNotCancelling(db:DbClient,tenantId:UUID,projectId:UUID){
 const {rows}=await db.query('SELECT id FROM project_preparation_cancellations WHERE tenant_id=$1 AND project_id=$2 AND completed_at IS NULL',[tenantId,projectId]);
 if(rows.length)throw new ConflictError('Preparation cancellation is in progress. Resolve existing work and finish cancellation before another lifecycle operation.','PROJECT_PREPARATION_CANCELLING');
}
export async function assertRecommissioningMutation(db:DbClient,tenantId:UUID,projectId:UUID,path?:string){
 const {rows}=await db.query<{status:string;id:string|null;cancellation_id:string|null;reviewed_evidence:{work?:{id:string}[];invitations?:{id:string}[]}|null}>(`SELECT p.status,r.id,c.id AS cancellation_id,c.reviewed_evidence FROM projects p
  LEFT JOIN project_recommissioning r ON r.tenant_id=p.tenant_id AND r.project_id=p.id AND r.opened_at IS NULL AND r.cancelled_at IS NULL
  LEFT JOIN project_preparation_cancellations c ON c.tenant_id=p.tenant_id AND c.project_id=p.id AND c.completed_at IS NULL
  WHERE p.tenant_id=$1 AND p.id=$2`,[tenantId,projectId]);
 if(rows[0]?.status==='ARCHIVED')throw new ConflictError('Archived projects are read-only. Recommission the project before changing work.','PROJECT_ARCHIVED');
 const cancelling=rows.find(row=>row.cancellation_id);
 if(cancelling){
  const match=path?.match(/\/tickets\/([0-9a-f-]+)\/(requester-cancel|field-cancel|survey-cancel(?:\/approve)?|complete|pc-approve|field-inability\/validate|draft)$/i);
  const invitation=path?.match(/\/invites\/([0-9a-f-]+)\/cancel$/i);
  const inviteId=invitation?.[1]?.toLowerCase();
  if(inviteId&&cancelling.reviewed_evidence?.invitations?.some(record=>record.id.toLowerCase()===inviteId))return;
  const ticketId=match?.[1]?.toLowerCase();
  if(!ticketId||!cancelling.reviewed_evidence?.work?.some(work=>work.id.toLowerCase()===ticketId))throw new ConflictError('Preparation cancellation allows only completion or cancellation of existing reviewed work and cancellation of reviewed invitations.','PROJECT_PREPARATION_CANCELLING');
  return;
 }
 const pending=rows.some(row=>row.id!==null&&row.id!==undefined);
 if(pending&&!path?.match(/\/invites\/[0-9a-f-]+\/cancel$/i)&&!path?.match(/\/tickets\/[0-9a-f-]+\/(assign|requester-cancel|field-cancel|survey-cancel(?:\/approve)?)$/i))throw new ConflictError('Project recommissioning preparation is in progress. Resolve work through authorized reassignment or cancellation; reopen before ordinary operations.','PROJECT_RECOMMISSIONING');
}

/** Read-only lifecycle availability for already-visible requests; never grants actor authority. */
export async function findPreparationCleanupTickets(db:DbClient,tenantId:UUID,projectId:UUID,visibleIds:UUID[]):Promise<Set<UUID>>{
 if(!visibleIds.length)return new Set();
 const {rows}=await db.query<{id:UUID}>(`SELECT t.id FROM tickets t
  JOIN projects p ON p.tenant_id=t.tenant_id AND p.id=t.project_id AND p.status='SETUP'
  JOIN project_preparation_cancellations c ON c.tenant_id=p.tenant_id AND c.project_id=p.id AND c.completed_at IS NULL
  WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.id=ANY($3::uuid[])
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(c.reviewed_evidence->'work','[]'::jsonb)) w WHERE w->>'id'=t.id::text)`,[tenantId,projectId,visibleIds]);
 return new Set(rows.map(row=>row.id));
}
