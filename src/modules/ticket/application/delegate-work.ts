import {ConflictError,ForbiddenError,NotFoundError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {ProjectRole} from '@/modules/identity/domain/types';
import {getProjectRole} from '@/lib/get-project-role';
import {assertActiveReviewProject} from './rejection-proposal';
import type {ITicketRepository,VisibilityScope} from './ports';
import {appendAuditEvent} from '@/modules/audit/application';

export interface DelegationTeam {id:UUID;name:string;leadId:UUID;leadName:string;leadRole:ProjectRole}
/** Only called after current request visibility is established. */
export async function delegationTeams(db:DbClient,tenantId:UUID,ticketId:UUID):Promise<DelegationTeam[]>{
  const {rows}=await db.query<DelegationTeam>(`WITH RECURSIVE request AS (
    SELECT tenant_id,project_id,aor_node_id FROM tickets WHERE tenant_id=$1 AND id=$2
  ), areas AS (
    SELECT a.id,a.parent_id FROM aor_nodes a JOIN request r ON a.tenant_id=r.tenant_id AND a.project_id=r.project_id AND a.id=r.aor_node_id WHERE a.retired_at IS NULL
    UNION SELECT a.id,a.parent_id FROM aor_nodes a JOIN areas child ON child.parent_id=a.id
    JOIN request r ON a.tenant_id=r.tenant_id AND a.project_id=r.project_id WHERE a.retired_at IS NULL
  ) SELECT st.id,st.name,u.id AS "leadId",u.name AS "leadName",pm.role AS "leadRole"
    FROM request r JOIN survey_teams st ON st.tenant_id=r.tenant_id AND st.project_id=r.project_id
    JOIN users u ON u.id=st.lead_user_id AND u.tenant_id=st.tenant_id
    JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
    JOIN project_memberships pm ON pm.project_id=st.project_id AND pm.user_id=u.id
    JOIN survey_team_members m ON m.tenant_id=st.tenant_id AND m.project_id=st.project_id AND m.team_id=st.id AND m.user_id=u.id
    WHERE st.deactivated_at IS NULL AND m.deactivated_at IS NULL AND u.deactivated_at IS NULL
      AND c.type<>'SUBCONTRACTOR' AND pm.access_disabled_at IS NULL AND pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF')
      AND EXISTS(SELECT 1 FROM survey_team_areas ta WHERE ta.tenant_id=st.tenant_id AND ta.project_id=st.project_id AND ta.team_id=st.id
        AND ta.deactivated_at IS NULL AND ta.area_id IN (SELECT id FROM areas)) ORDER BY st.name,st.id`,[tenantId,ticketId]);
  return rows;
}

/** Caller owns lifecycle barrier, current session validation and ticket row lock. */
export async function delegateWork(repo:ITicketRepository,db:DbClient,actor:{tenantId:UUID;ticketId:UUID;actorId:UUID;actorRole:ProjectRole;visibility?:VisibilityScope},teamId:UUID){
  if(actor.actorRole!=='SURVEY_MANAGER')throw new ForbiddenError('Only the Survey Manager can delegate work to a team.');
  const ticket=actor.visibility?await repo.findById(db,actor.tenantId,actor.ticketId,actor.visibility):await repo.findByIdInternal(db,actor.tenantId,actor.ticketId);
  if(!ticket)throw new NotFoundError('Request not found');
  if(await getProjectRole(db,actor.tenantId,ticket.projectId,actor.actorId)!=='SURVEY_MANAGER')throw new ForbiddenError('Current Survey Manager authority is required.');
  await assertActiveReviewProject(db,actor.tenantId,ticket.projectId);
  if(ticket.status!=='APPROVED'||ticket.assignedInstrumentManId)throw new ConflictError('Delegate approved work before a field crew starts. Reload requests.');
  const team=(await delegationTeams(db,actor.tenantId,actor.ticketId)).find(team=>team.id===teamId);
  if(!team)throw new ConflictError('Choose an active team responsible for this request Area, with a Superintendent or Party Chief lead.');
  await repo.patchTicket(db,actor.tenantId,actor.ticketId,{status:'APPROVED',assignedPartyChiefId:team.leadRole==='PARTY_CHIEF'?team.leadId:null,surveyLeadId:team.leadId},
    {expectedStatus:ticket.status,expectedRowVersion:ticket.rowVersion});
  await db.query("UPDATE survey_work_delegations SET ended_at=now(),end_reason='REDELEGATED' WHERE tenant_id=$1 AND ticket_id=$2 AND ended_at IS NULL",[actor.tenantId,actor.ticketId]);
  await db.query("UPDATE ticket_assignment_history SET ended_at=now(),end_reason='TEAM_DELEGATED' WHERE tenant_id=$1 AND ticket_id=$2 AND ended_at IS NULL",[actor.tenantId,actor.ticketId]);
  const result=await db.query<{id:UUID}>(`INSERT INTO survey_work_delegations(tenant_id,project_id,ticket_id,team_id,lead_user_id,delegated_by)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[actor.tenantId,ticket.projectId,actor.ticketId,teamId,team.leadId,actor.actorId]);
  const delegationId=result.rows[0]!.id;
  await appendAuditEvent(db,{tenantId:actor.tenantId,ticketId:actor.ticketId,actorId:actor.actorId,eventType:'ticket.team_delegated',payload:{delegationId,teamId,teamName:team.name,leadId:team.leadId,previousChiefId:ticket.assignedPartyChiefId}});
  await db.query(`INSERT INTO survey_notifications(tenant_id,project_id,ticket_id,recipient_id,actor_id,event_key,title,message)
    SELECT m.tenant_id,m.project_id,$3,m.user_id,$4,$5,'Work assigned to your team',$6
    FROM survey_team_members m JOIN users u ON u.tenant_id=m.tenant_id AND u.id=m.user_id
    JOIN project_memberships pm ON pm.project_id=m.project_id AND pm.user_id=m.user_id
    JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id
    WHERE m.tenant_id=$1 AND m.project_id=$2 AND m.team_id=$7 AND m.deactivated_at IS NULL
      AND u.deactivated_at IS NULL AND c.type<>'SUBCONTRACTOR' AND pm.access_disabled_at IS NULL
      AND pm.role IN ('SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
    ON CONFLICT(tenant_id,recipient_id,event_key) DO NOTHING`,[actor.tenantId,ticket.projectId,actor.ticketId,actor.actorId,`delegation:${delegationId}`,`${ticket.ticketNumber??'Survey request'} is assigned to ${team.name} and is awaiting crew selection.`,teamId]);
  return {delegationId,teamId,teamName:team.name,leadName:team.leadName,status:'AWAITING_CREW' as const};
}
