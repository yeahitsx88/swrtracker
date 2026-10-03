import {ConflictError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
/** Run under the tenant barrier, before command replay. Preparation retains history;
 * ordinary ticket work is suspended. Existing authorized reassignment/cancellation
 * can resolve unfinished work; this guard never supplies workflow authority.
 */
export async function assertRecommissioningMutation(db:DbClient,tenantId:UUID,projectId:UUID,path?:string){
 const pending=(await db.query(`SELECT id FROM project_recommissioning WHERE tenant_id=$1 AND project_id=$2 AND opened_at IS NULL`,[tenantId,projectId])).rows.length>0;
 if(pending&&!path?.match(/\/tickets\/[0-9a-f-]+\/(assign|requester-cancel|field-cancel|survey-cancel(?:\/approve)?)$/i))throw new ConflictError('Project recommissioning preparation is in progress. Resolve work through authorized reassignment or cancellation; reopen before ordinary operations.','PROJECT_RECOMMISSIONING');
}
