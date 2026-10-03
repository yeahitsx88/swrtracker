import {createHash} from 'node:crypto';
import {ConflictError,NotFoundError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import {appendAdministrativeEvent} from '@/modules/audit/infrastructure/administrative-event.repository';
import {snapshotCte} from './survey-staffing.repository';
import type {ManagerAppointmentRepository,ManagerSelection,ManagerAppointment,ManagerPreview} from '../application/appoint-survey-manager';

export class SurveyManagerPgRepository implements ManagerAppointmentRepository {
 async preview(db:DbClient,auth:AuthContext,projectId:UUID,selection:ManagerSelection):Promise<ManagerPreview>{
  const params=[auth.tenantId,projectId],ids=[selection.outgoingUserId,selection.incomingUserId,selection.coverageUserId];
  const project=(await db.query<{status:string;crew_build:string}>('SELECT status,crew_build FROM projects WHERE tenant_id=$1 AND id=$2',params)).rows[0];
  if(!project)throw new NotFoundError('Project not found');
  if(project.status==='ARCHIVED'||project.crew_build!=='FULL')throw new ConflictError('Manager handover requires an editable FULL project');
  const members=(await db.query<{user_id:UUID;name:string;role:string}>(`SELECT u.id AS user_id,u.name,pm.role FROM project_memberships pm
    JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1 JOIN users u ON u.id=pm.user_id AND u.tenant_id=$1
    JOIN companies c ON c.id=u.company_id AND c.tenant_id=$1 WHERE pm.project_id=$2 AND u.id=ANY($3::uuid[])
    AND u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL AND c.type<>'SUBCONTRACTOR' ORDER BY u.id`,[...params,ids])).rows;
  const outgoing=members.find(m=>m.user_id===selection.outgoingUserId),incoming=members.find(m=>m.user_id===selection.incomingUserId),coverage=members.find(m=>m.user_id===selection.coverageUserId);
  if(outgoing?.role!=='SURVEY_MANAGER'||incoming?.role!=='SURVEY_SUPERINTENDENT'||coverage?.role!=='SURVEY_SUPERINTENDENT')throw new ConflictError('Select an eligible current manager and two eligible current Superintendents');
  const areas=(await db.query<{id:UUID;aor_node_id:UUID;department_id:UUID|null;retired_at:string|null}>(`SELECT aa.id,aa.aor_node_id,aa.department_id,n.retired_at FROM aor_assignments aa
   JOIN aor_nodes n ON n.id=aa.aor_node_id AND n.tenant_id=aa.tenant_id AND n.project_id=aa.project_id
   WHERE aa.tenant_id=$1 AND aa.project_id=$2 AND aa.user_id=$3 AND aa.deactivated_at IS NULL ORDER BY aa.id`,[...params,incoming.user_id])).rows;
  const links=(await db.query<{id:UUID;aor_node_id:UUID;party_chief_id:UUID}>(`SELECT id,aor_node_id,party_chief_id FROM survey_reporting_links WHERE tenant_id=$1 AND project_id=$2 AND superintendent_id=$3 AND deactivated_at IS NULL ORDER BY id`,[...params,incoming.user_id])).rows;
  const obligations=(await db.query<{kind:string;id:UUID}>(`SELECT 'responsibility' AS kind,id FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND revoked_at IS NULL
   UNION ALL SELECT 'acting',id FROM acting_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND revoked_at IS NULL
   UNION ALL SELECT 'team',id FROM survey_teams WHERE tenant_id=$1 AND project_id=$2 AND lead_user_id=$3 AND deactivated_at IS NULL
   UNION ALL SELECT 'team-member',team_id AS id FROM survey_team_members WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL
   UNION ALL SELECT 'roster',id FROM crew_rosters WHERE tenant_id=$1 AND project_id=$2 AND (party_chief_id=$3 OR instrument_man_id=$3) AND deactivated_at IS NULL ORDER BY kind,id`,[...params,incoming.user_id])).rows;
  const blockers=[...new Set(obligations.map(o=>`Resolve ${o.kind} duties through their existing workflow`))];
  if(areas.some(a=>a.department_id||a.retired_at))blockers.push('Resolve department or retired Area coverage before handover');
  if(links.some(l=>!areas.some(a=>a.aor_node_id===l.aor_node_id)))blockers.push('Reporting links require matching individual Area coverage');
  const token=(await db.query<{token:string}>(`WITH ${snapshotCte} SELECT token FROM snapshot`,params)).rows[0]?.token;
  if(!token)throw new NotFoundError('Project not found');
  const selected={outgoingUserId:selection.outgoingUserId,incomingUserId:selection.incomingUserId,coverageUserId:selection.coverageUserId};
  const snapshot=createHash('sha256').update(JSON.stringify({selection:selected,token,areas,links,obligations})).digest('hex');
  return {snapshot,outgoing:{userId:outgoing.user_id,name:outgoing.name},incoming:{userId:incoming.user_id,name:incoming.name},coverage:{userId:coverage.user_id,name:coverage.name},areaIds:[...new Set(areas.map(a=>a.aor_node_id))],reportingLinkIds:links.map(l=>l.id),blockers};
 }
 async appoint(db:DbClient,auth:AuthContext,projectId:UUID,input:ManagerAppointment,preview:ManagerPreview){
  const scope=[auth.tenantId,projectId],changes:Record<string,unknown>={reason:input.reason,snapshot:input.snapshot,outgoingUserId:input.outgoingUserId,incomingUserId:input.incomingUserId,coverageUserId:input.coverageUserId,previousRole:'SURVEY_SUPERINTENDENT',role:'SURVEY_MANAGER',areaIds:preview.areaIds,reportingLinkIds:preview.reportingLinkIds,historicalTicketsUnchanged:true,outgoingAccessRetainedUntilSeparateDisable:true};
  // Explicitly chosen coverage; preserve old rows and their provenance.
  await db.query(`INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id)
   SELECT $1,$2,$3,area FROM unnest($4::uuid[]) area WHERE NOT EXISTS(SELECT 1 FROM aor_assignments aa WHERE aa.tenant_id=$1 AND aa.project_id=$2 AND aa.user_id=$3 AND aa.aor_node_id=area AND aa.department_id IS NULL AND aa.deactivated_at IS NULL)`,[...scope,input.coverageUserId,preview.areaIds]);
  const old=(await db.query<{party_chief_id:UUID;aor_node_id:UUID}>(`UPDATE survey_reporting_links SET deactivated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND id=ANY($3::uuid[]) AND deactivated_at IS NULL RETURNING party_chief_id,aor_node_id`,[...scope,preview.reportingLinkIds])).rows;
  for(const link of old)await db.query(`INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)`,[...scope,input.coverageUserId,link.party_chief_id,link.aor_node_id,auth.userId]);
  await db.query('UPDATE aor_assignments SET deactivated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL',[...scope,input.incomingUserId]);
  await db.query(`UPDATE project_memberships SET role='SURVEY_MANAGER' WHERE project_id=$2 AND user_id=$3 AND EXISTS(SELECT 1 FROM projects WHERE tenant_id=$1 AND id=$2)`,[...scope,input.incomingUserId]);
  await db.query('UPDATE users SET session_version=COALESCE(session_version,1)+1 WHERE tenant_id=$1 AND id=ANY($2::uuid[])',[auth.tenantId,[input.incomingUserId,input.coverageUserId]]);
  const eventId=await appendAdministrativeEvent(db,{auth,projectId,subjectUserId:input.incomingUserId,eventType:'project.role_changed',authorityEvidence:{capability:'PROJECT_ADMIN',lifecycleBarrier:'EXCLUSIVE'},changes});
  return {eventId,incomingUserId:input.incomingUserId,coverageUserId:input.coverageUserId};
 }
}
