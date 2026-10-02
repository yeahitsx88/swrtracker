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
 return rows[0];},{req,auth,mode:'SHARED',authorize:async(db,current)=>{await assertProjectAdministrator(db,current,projectId);}});
 return NextResponse.json({diagnostics,generatedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return errorResponse(error);}
}
