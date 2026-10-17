import {createHash,randomUUID} from 'node:crypto';
import type {AuthContext} from '@/lib/auth';
import type {DbClient,UUID} from '@/shared/types';
import {NotFoundError} from '@/shared/errors';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import {setProjectAdministrator} from '../application/project-administration';
import {snapshotCte} from './survey-staffing.repository';
import {TenancyRepository} from './tenancy.repository';
import type {RecommissionRepository,RecommissionCommand,RecommissionPreview,RecommissionRecord} from '../application/recommission-project';
export class SqlRecommissionRepository implements RecommissionRepository {
 async preview(db:DbClient,auth:AuthContext,projectId:UUID):Promise<RecommissionPreview>{
  const scope=[auth.tenantId,projectId],project=(await db.query<{status:string;crew_build:string}>(`SELECT * FROM projects WHERE tenant_id=$1 AND id=$2`,scope)).rows[0];
  if(!project)throw new NotFoundError('Project not found');
  const period=(await db.query<{id:string;replacement_admin_id:string}>(`SELECT id,replacement_admin_id FROM project_recommissioning WHERE tenant_id=$1 AND project_id=$2 AND opened_at IS NULL AND cancelled_at IS NULL`,scope)).rows[0];
  const candidates=(await db.query<RecommissionRecord>(`SELECT u.id,u.name,u.email||' · '||c.name AS detail FROM users u JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id WHERE u.tenant_id=$1 AND u.deactivated_at IS NULL AND c.type IN('GC','OWNER_REP') AND NOT EXISTS(SELECT 1 FROM project_memberships pm WHERE pm.project_id=$2 AND pm.user_id=u.id AND pm.access_disabled_at IS NOT NULL) ORDER BY u.id`,scope)).rows;
  const memberships=(await db.query<{id:string;name:string;detail:string;role:string;eligible:boolean}>(`SELECT u.id,u.name,u.email||' · '||pm.role||' · '||c.name AS detail,pm.role,(u.deactivated_at IS NULL AND (c.type<>'SUBCONTRACTOR' OR pm.role='REQUESTER')) AS eligible FROM project_memberships pm JOIN users u ON u.id=pm.user_id AND u.tenant_id=$1 JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id WHERE pm.project_id=$2 AND pm.access_disabled_at IS NULL AND u.deactivated_at IS NULL ORDER BY u.id`,scope)).rows;
  const companies=(await db.query<RecommissionRecord>(`SELECT c.id,c.name,c.type AS detail FROM project_companies pc JOIN companies c ON c.id=pc.company_id AND c.tenant_id=pc.tenant_id WHERE pc.tenant_id=$1 AND pc.project_id=$2 ORDER BY c.id`,scope)).rows;
  const invitations=(await db.query<RecommissionRecord>(`SELECT id,email AS name,role AS detail FROM invites WHERE tenant_id=$1 AND project_id=$2 AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at>NOW() ORDER BY id`,scope)).rows;
  const teams=(await db.query<RecommissionRecord>(`SELECT id,name,lead_user_id::text AS detail FROM survey_teams WHERE tenant_id=$1 AND project_id=$2 AND deactivated_at IS NULL ORDER BY id`,scope)).rows;
  const work=(await db.query<RecommissionRecord & {row_version:number;assigned_party_chief_id:string|null;assigned_instrument_man_id:string|null}>(`SELECT id,COALESCE(ticket_number,'Draft '||id::text) AS name,status AS detail,row_version,assigned_party_chief_id,assigned_instrument_man_id FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND status NOT IN('COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED') AND draft_deleted_at IS NULL ORDER BY id`,scope)).rows;
  const readiness=await new TenancyRepository().getProjectActivationReadiness(db,auth.tenantId,projectId);
  const blockers:string[]=[];
  if(!readiness.aorLevelsCount||!readiness.aorNodesCount)blockers.push('Establish current Area levels and nodes.');
  if(!readiness.surveyManagerCount)blockers.push('Appoint an eligible Survey Manager.');
  if(project.crew_build==='FULL'&&!readiness.superintendentAorAssignmentCount)blockers.push('Establish eligible Superintendent Area coverage.');
  if(invitations.length)blockers.push('Review and cancel or complete outstanding invitations before reopening.');
  if(memberships.some(m=>!m.eligible))blockers.push('Offboard ineligible retained memberships.');
  if(period&&!memberships.some(m=>m.id===period.replacement_admin_id&&m.eligible))blockers.push('The replacement Project Admin must retain eligible project access.');
  if(period&&!(await db.query(`SELECT id FROM project_admin_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND revoked_at IS NULL`,[...scope,period.replacement_admin_id])).rows.length)blockers.push('Restore a valid independent grant for the named replacement Project Admin.');
  const eligibleIds=new Set(memberships.filter(m=>m.eligible).map(m=>m.id));
  const eligibleRole=(id:string|null,role:string)=>!id||memberships.some(m=>m.id===id&&m.eligible&&m.role===role);
  if(work.some(w=>!eligibleRole(w.assigned_party_chief_id,'PARTY_CHIEF')||!eligibleRole(w.assigned_instrument_man_id,'INSTRUMENT_MAN')))blockers.push('Resolve unfinished assignments to departed or ineligible crew members through the existing workflow.');
  const teamMembers=(await db.query<{team_id:string;user_id:string}>(`SELECT tm.team_id,tm.user_id FROM survey_team_members tm JOIN survey_teams st ON st.tenant_id=tm.tenant_id AND st.project_id=tm.project_id AND st.id=tm.team_id WHERE tm.tenant_id=$1 AND tm.project_id=$2 AND tm.deactivated_at IS NULL AND st.deactivated_at IS NULL ORDER BY tm.team_id,tm.user_id`,scope)).rows;
  if(teamMembers.some(m=>!eligibleIds.has(m.user_id))||teams.some(t=>!eligibleIds.has(t.detail)))blockers.push('Resolve named teams with departed or ineligible personnel.');
  const authority=(await db.query(`SELECT user_id,revoked_at FROM project_admin_grants WHERE tenant_id=$1 AND project_id=$2 ORDER BY id`,scope)).rows;
  const staffingSnapshot=(await db.query<{token:string}>(`WITH ${snapshotCte} SELECT token FROM snapshot`,scope)).rows[0]?.token;
  const staffing=(await db.query(`SELECT 'roster' AS kind,id::text,to_jsonb(r) AS value FROM crew_rosters r WHERE tenant_id=$1 AND project_id=$2 UNION ALL SELECT 'area',id::text,to_jsonb(a) FROM aor_assignments a WHERE tenant_id=$1 AND project_id=$2 ORDER BY kind,id`,scope)).rows;
  const snapshot=createHash('sha256').update(JSON.stringify({project,period,memberships,companies,invitations,teams,work,readiness,authority,staffing,staffingSnapshot,teamMembers})).digest('hex');
  return {snapshot,status:project.status,periodId:period?.id??null,replacementAdminId:period?.replacement_admin_id??null,candidates,members:memberships,companies,invitations,teams,work,blockers};
 }
 async begin(db:DbClient,auth:AuthContext,projectId:UUID,command:Extract<RecommissionCommand,{action:'BEGIN'}>,preview:RecommissionPreview){
  const id=randomUUID(),scope=[auth.tenantId,projectId];
  const projectSnapshot=(await db.query(`SELECT * FROM projects WHERE tenant_id=$1 AND id=$2`,scope)).rows[0];
  const archivedEvidence={...preview,projectSnapshot};
  await db.query(`INSERT INTO project_recommissioning(id,tenant_id,project_id,replacement_admin_id,initiated_by,reason,archived_evidence) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,...scope,command.replacementAdminId,auth.userId,command.reason,JSON.stringify(archivedEvidence)]);
  await db.query(`UPDATE projects SET status='SETUP' WHERE tenant_id=$1 AND id=$2 AND status='ARCHIVED'`,scope);
  const association=await db.query(`INSERT INTO project_companies(tenant_id,project_id,company_id,associated_by) SELECT $1,$2,company_id,$4 FROM users WHERE tenant_id=$1 AND id=$3 ON CONFLICT DO NOTHING RETURNING company_id`,[...scope,command.replacementAdminId,auth.userId]);
  const membership=await db.query(`INSERT INTO project_memberships(id,project_id,user_id,role) VALUES($1,$2,$3,'REQUESTER') ON CONFLICT(project_id,user_id) DO NOTHING RETURNING id`,[randomUUID(),projectId,command.replacementAdminId]);
  await setProjectAdministrator(db,auth,projectId,command.replacementAdminId,true);
  await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:command.replacementAdminId,eventType:'project.recommissioning_started',authorityEvidence:{centralIT:true},changes:{periodId:id,reason:command.reason,archivedEvidence,membershipAdded:!!membership.rows.length,companyAssociated:!!association.rows.length,historyRetained:true,disabledAccessRestored:false}});
  return {periodId:id};
 }
 async open(db:DbClient,auth:AuthContext,projectId:UUID,command:Extract<RecommissionCommand,{action:'OPEN'}>,preview:RecommissionPreview){
  await db.query(`UPDATE projects SET status='ACTIVE',activated_at=NOW(),activated_by=$3 WHERE tenant_id=$1 AND id=$2 AND status='SETUP'`,[auth.tenantId,projectId,auth.userId]);
  await db.query(`UPDATE project_recommissioning SET opened_at=NOW(),opened_by=$3 WHERE tenant_id=$1 AND id=$2`,[auth.tenantId,preview.periodId,auth.userId]);
  await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:null,eventType:'project.recommissioned',authorityEvidence:{centralIT:true},changes:{periodId:preview.periodId,reason:command.reason,reviewedEvidence:preview,retainedMembers:command.retainedMembers,retainedCompanies:command.retainedCompanies,continuedWork:command.continuedWork,historyRetained:true}});
  return {periodId:preview.periodId!};
 }
}
