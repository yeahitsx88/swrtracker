import type {AuthContext} from '@/lib/auth';
import {resolveProjectCapabilities} from '@/lib/project-capabilities';
import {assertRecommissioningMutation} from '@/lib/recommissioning-gate';
import {requireSurveyReviewAuthority} from '@/lib/survey-review-authority';
import {surveyTeamCoverageQuery} from '@/lib/survey-team-coverage';
import {ForbiddenError,NotFoundError,ConflictError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {ProjectRole} from '@/modules/identity/domain/types';

export interface RecoveryActor {kind:'TENANT_ADMIN'|'PROJECT_ADMIN'|'SURVEY_MANAGER'|'SURVEY_SUPERINTENDENT'|'PARTY_CHIEF';role:ProjectRole|null;projectStatus:string;preparing:boolean}
/** Caller holds the tenant lifecycle barrier and has revalidated the cookie/session. */
export async function authorizeRecoveryActor(db:DbClient,auth:AuthContext,projectId:UUID,mutation=false):Promise<RecoveryActor>{
 const caps=await resolveProjectCapabilities(db,auth,projectId);
 const project=(await db.query<{status:string;preparing:boolean}>(`SELECT p.status,EXISTS(SELECT 1 FROM project_recommissioning r WHERE r.tenant_id=p.tenant_id AND r.project_id=p.id AND r.opened_at IS NULL AND r.cancelled_at IS NULL) AS preparing FROM projects p WHERE p.tenant_id=$1 AND p.id=$2 FOR SHARE OF p`,[auth.tenantId,projectId])).rows[0];
 if(!project)throw new NotFoundError('Project not found');
 const role=caps.operationalRole;
 const kind=caps.canAdminister?(caps.centralIT?'TENANT_ADMIN':'PROJECT_ADMIN'):role;
 if(!kind||!['TENANT_ADMIN','PROJECT_ADMIN','SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'].includes(kind))throw new ForbiddenError('Submitted recovery requires current project administration or eligible Survey leadership.');
 if(mutation){await assertRecommissioningMutation(db,auth.tenantId,projectId);if(project.status!=='ACTIVE')throw new ConflictError('Submitted request recovery requires an active project.');}
 return {kind:kind as RecoveryActor['kind'],role,projectStatus:project.status,preparing:project.preparing};
}

/** Exact same bounded disclosure predicate for list, reviewed request and replay. */
export function recoveryVisibility(actor:RecoveryActor,parameter='$3'):string{
 if(['TENANT_ADMIN','PROJECT_ADMIN','SURVEY_MANAGER'].includes(actor.kind))return `${parameter}::uuid IS NOT NULL`;
 const ancestors=`WITH RECURSIVE ancestors AS (SELECT id,parent_id FROM aor_nodes WHERE tenant_id=t.tenant_id AND project_id=t.project_id AND id=t.aor_node_id AND retired_at IS NULL UNION SELECT n.id,n.parent_id FROM aor_nodes n JOIN ancestors a ON a.parent_id=n.id WHERE n.tenant_id=t.tenant_id AND n.project_id=t.project_id AND n.retired_at IS NULL) SELECT id FROM ancestors`;
 const team=`EXISTS (${surveyTeamCoverageQuery(parameter,actor.kind as 'SURVEY_SUPERINTENDENT'|'PARTY_CHIEF')})`;
 if(actor.kind==='SURVEY_SUPERINTENDENT')return `(${team} OR EXISTS(SELECT 1 FROM project_responsibility_grants g WHERE g.tenant_id=t.tenant_id AND g.project_id=t.project_id AND g.user_id=${parameter} AND g.responsibility='SURVEY_REVIEWER' AND g.revoked_at IS NULL AND g.aor_node_id IN (${ancestors})))`;
 // A same-time witness with different Chiefs is ambiguous. Do not order UUIDs as time.
 const last=`SELECT h.party_chief_id FROM ticket_assignment_history h WHERE h.tenant_id=t.tenant_id AND h.ticket_id=t.id AND h.party_chief_id IS NOT NULL AND h.assigned_at=(SELECT max(l.assigned_at) FROM ticket_assignment_history l WHERE l.tenant_id=t.tenant_id AND l.ticket_id=t.id AND l.party_chief_id IS NOT NULL)`;
 return `(${team} AND EXISTS(${last}) AND ${parameter}::uuid=ALL(${last}))`;
}
export async function recoveryAuthorityEvidence(db:DbClient,auth:AuthContext,projectId:UUID,actor:RecoveryActor,ticket:{id:UUID;aorNodeId:UUID|null}):Promise<Record<string,unknown>>{
 if(actor.kind==='TENANT_ADMIN'||actor.kind==='PROJECT_ADMIN'){
  const row=actor.kind==='TENANT_ADMIN'?(await db.query<{id:UUID}>("SELECT user_id AS id FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2 AND role='TENANT_ADMIN' FOR SHARE",[auth.tenantId,auth.userId])).rows[0]:
   (await db.query<{id:UUID}>('SELECT id FROM project_admin_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND revoked_at IS NULL FOR SHARE',[auth.tenantId,projectId,auth.userId])).rows[0];
  if(!row)throw new ForbiddenError('Current recovery administration authority is required.');
  return {kind:actor.kind,...(actor.kind==='TENANT_ADMIN'?{membershipUserId:row.id}:{grantId:row.id}),operationalRole:actor.role};
 }
 const coverage=await requireSurveyReviewAuthority(db,{tenantId:auth.tenantId,projectId,aorNodeId:ticket.aorNodeId},{actorId:auth.userId,actorRole:actor.kind});
 if(actor.kind!=='PARTY_CHIEF')return {kind:actor.kind,coverage};
 const witnesses=(await db.query<{id:UUID;party_chief_id:UUID;assigned_at:Date}>(`SELECT id,party_chief_id,assigned_at FROM ticket_assignment_history WHERE tenant_id=$1 AND ticket_id=$2 AND party_chief_id IS NOT NULL AND assigned_at=(SELECT max(assigned_at) FROM ticket_assignment_history WHERE tenant_id=$1 AND ticket_id=$2 AND party_chief_id IS NOT NULL) ORDER BY id FOR SHARE`,[auth.tenantId,ticket.id])).rows;
 if(!witnesses.length||witnesses.some(w=>w.party_chief_id!==auth.userId))throw new ForbiddenError('A verified last recorded Chief assignment is required.');
 return {kind:'LAST_RECORDED_CHIEF',coverage,assignments:witnesses.map(w=>({id:w.id,chiefId:w.party_chief_id,assignedAt:w.assigned_at}))};
}
