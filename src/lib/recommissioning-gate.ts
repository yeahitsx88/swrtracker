import {ConflictError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
/** Run under the tenant barrier, before command replay. Preparation retains history;
 * ordinary ticket work is suspended. Existing authorized reassignment/cancellation
 * can resolve unfinished work; this guard never supplies workflow authority.
 */
export async function assertRecommissioningMutation(db:DbClient,tenantId:UUID,projectId:UUID,path?:string){
 const {rows}=await db.query<{status:string;id:string|null}>(`SELECT p.status,r.id FROM projects p
  LEFT JOIN project_recommissioning r ON r.tenant_id=p.tenant_id AND r.project_id=p.id AND r.opened_at IS NULL
  WHERE p.tenant_id=$1 AND p.id=$2`,[tenantId,projectId]);
 if(rows[0]?.status==='ARCHIVED')throw new ConflictError('Archived projects are read-only. Recommission the project before changing work.','PROJECT_ARCHIVED');
 const pending=rows.some(row=>row.id!==null&&row.id!==undefined);
 if(pending&&!path?.match(/\/tickets\/[0-9a-f-]+\/(assign|requester-cancel|field-cancel|survey-cancel(?:\/approve)?)$/i))throw new ConflictError('Project recommissioning preparation is in progress. Resolve work through authorized reassignment or cancellation; reopen before ordinary operations.','PROJECT_RECOMMISSIONING');
}
