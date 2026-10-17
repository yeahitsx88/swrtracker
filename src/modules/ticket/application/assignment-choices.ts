import {ForbiddenError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {ProjectRole} from '@/modules/identity/domain/types';
import {surveyTeamCoverageQuery} from '@/lib/survey-team-coverage';
export interface AssignmentChoice {id:UUID;name:string;role:'PARTY_CHIEF'|'INSTRUMENT_MAN';teamId:UUID|null}
/** The route authenticates current ticket visibility before calling this reader. */
export async function assignmentChoices(db:DbClient,actor:{tenantId:UUID;ticketId:UUID;actorId:UUID;actorRole:ProjectRole}):Promise<AssignmentChoice[]>{
 if(!['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'].includes(actor.actorRole))throw new ForbiddenError('Your role cannot assign survey work.');
 const scope=actor.actorRole==='SURVEY_MANAGER'?'':actor.actorRole==='PARTY_CHIEF'?`AND t.assigned_party_chief_id=$3 AND
  ((pm.role='PARTY_CHIEF' AND person.id=$3) OR (pm.role='INSTRUMENT_MAN' AND EXISTS(SELECT 1 FROM crew_rosters cr
    WHERE cr.tenant_id=t.tenant_id AND cr.project_id=t.project_id AND cr.party_chief_id=$3 AND cr.instrument_man_id=person.id AND cr.deactivated_at IS NULL)))`:
  `AND EXISTS(SELECT 1 FROM (${surveyTeamCoverageQuery('$3','SURVEY_SUPERINTENDENT')}) coverage
    WHERE membership.team_id=coverage.team_id
    AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY[t.assigned_party_chief_id,t.assigned_instrument_man_id]) previous(id)
      WHERE previous.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM survey_team_members oldmember
        WHERE oldmember.tenant_id=t.tenant_id AND oldmember.project_id=t.project_id AND oldmember.team_id=coverage.team_id
          AND oldmember.user_id=previous.id AND oldmember.deactivated_at IS NULL))
    AND NOT EXISTS(SELECT 1 FROM survey_work_delegations d WHERE d.tenant_id=t.tenant_id AND d.ticket_id=t.id
      AND d.ended_at IS NULL AND d.team_id<>coverage.team_id))`;
 const {rows}=await db.query<AssignmentChoice>(`SELECT person.id,person.name,pm.role,membership.team_id AS "teamId"
   FROM tickets t JOIN project_memberships pm ON pm.project_id=t.project_id
   JOIN users person ON person.id=pm.user_id AND person.tenant_id=t.tenant_id
   JOIN companies c ON c.id=person.company_id AND c.tenant_id=person.tenant_id
   LEFT JOIN survey_team_members membership ON membership.tenant_id=t.tenant_id AND membership.project_id=t.project_id
     AND membership.user_id=person.id AND membership.deactivated_at IS NULL
   WHERE t.tenant_id=$1 AND t.id=$2 AND pm.role IN ('PARTY_CHIEF','INSTRUMENT_MAN')
     AND pm.access_disabled_at IS NULL AND person.deactivated_at IS NULL AND c.type<>'SUBCONTRACTOR'
     ${scope} ORDER BY person.name,person.id`,actor.actorRole==='SURVEY_MANAGER'?[actor.tenantId,actor.ticketId]:[actor.tenantId,actor.ticketId,actor.actorId]);
 return rows;
}
