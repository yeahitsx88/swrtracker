import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {withTransaction} from '@/lib/with-transaction';
import {assertProjectAdministrator} from '@/lib/project-capabilities';
import type {UUID} from '@/shared/types';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,ctx:{params:Promise<{projectId:string}>}){
 try{const auth=await requireActiveAuth(req),projectId=(await ctx.params).projectId as UUID;requireResourceUuid(projectId,'projectId');
 const diagnostics=await withTransaction(async db=>{
 await assertProjectAdministrator(db,auth,projectId);
 const {rows}=await db.query(`SELECT p.id AS "projectId",p.status,
 (SELECT count(*)::int FROM project_memberships pm WHERE pm.project_id=p.id AND pm.access_disabled_at IS NOT NULL) AS "disabledMemberships",
 (SELECT count(*)::int FROM tickets t WHERE t.tenant_id=p.tenant_id AND t.project_id=p.id AND t.draft_deleted_at IS NULL AND t.status='SUBMITTED' AND NOW()-t.submitted_at>interval '24 hours') AS "staleSubmitted",
 (SELECT count(*)::int FROM tickets t WHERE t.tenant_id=p.tenant_id AND t.project_id=p.id AND t.draft_deleted_at IS NULL AND t.status='DELAYED') AS delayed,
 (SELECT count(*)::int FROM account_offboarding_reviews r WHERE r.tenant_id=p.tenant_id AND r.project_id=p.id AND r.status='PENDING') AS "pendingCentralReviews"
 FROM projects p WHERE p.tenant_id=$1 AND p.id=$2`,[auth.tenantId,projectId]);
 const health=(await db.query(`SELECT count(*)::int AS "requestCount",count(*) FILTER(WHERE status>=400)::int AS "errorCount",
  avg(duration_ms) FILTER(WHERE observed_at>=now()-interval '1 hour') AS "currentAvgMs",
  count(*) FILTER(WHERE observed_at>=now()-interval '1 hour')::int AS "currentSamples",
  avg(duration_ms) FILTER(WHERE observed_at<now()-interval '1 hour') AS "baselineAvgMs",
  count(*) FILTER(WHERE observed_at<now()-interval '1 hour')::int AS "baselineSamples",
  percentile_cont(0.95) WITHIN GROUP(ORDER BY duration_ms) AS "p95Ms"
  FROM project_request_observations WHERE tenant_id=$1 AND project_id=$2 AND observed_at>=now()-interval '24 hours'`,[auth.tenantId,projectId])).rows[0];
 const errors=(await db.query(`SELECT o.id,o.route,o.method,o.status,o.duration_ms AS "durationMs",o.correlation_id AS "correlationId",o.error_code AS "errorCode",o.ticket_id AS "ticketId",o.prior_status AS "priorStatus",o.observed_at AS "observedAt",u.name AS "actorName"
  FROM project_request_observations o JOIN users u ON u.id=o.actor_id AND u.tenant_id=o.tenant_id
  WHERE o.tenant_id=$1 AND o.project_id=$2 AND o.status>=400 AND o.observed_at>=now()-interval '24 hours' ORDER BY o.observed_at DESC,o.id LIMIT 100`,[auth.tenantId,projectId])).rows;
 const delivery=(await db.query(`SELECT count(*)::int AS "queuedCount",count(*) FILTER(WHERE n.delivery_state IN ('SENT','CAPTURED'))::int AS "deliveredCount",
  avg(extract(epoch FROM n.delivered_at-n.created_at)*1000) FILTER(WHERE n.delivered_at IS NOT NULL) AS "averageDeliveryMs"
  FROM notification_outbox n JOIN tickets t ON t.id=n.ticket_id AND t.tenant_id=n.tenant_id
  WHERE n.tenant_id=$1 AND t.project_id=$2 AND n.event_type IN ('SUBMITTED','RESUBMITTED') AND n.created_at>=now()-interval '24 hours'`,[auth.tenantId,projectId])).rows[0];
 return {diagnostics:rows[0],health,errors,delivery};},{req,auth,mode:'SHARED',authorize:async(db,current)=>{await assertProjectAdministrator(db,current,projectId);}});
 return NextResponse.json({...diagnostics,generatedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return errorResponse(error);}
}
