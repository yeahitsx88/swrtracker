import {ForbiddenError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {ProjectRole} from '@/modules/identity/domain/types';
import {surveyTeamCoverageQuery} from '@/lib/survey-team-coverage';

/** The mutation's tenant barrier keeps team/crew membership stable during this check. */
export async function assertAssignmentScope(db:DbClient,scope:{tenantId:UUID;projectId:UUID;aorNodeId:UUID|null},
  actor:{actorId:UUID;actorRole:ProjectRole},members:{partyChiefId:UUID|null;instrumentManId:UUID|null;previousChiefId:UUID|null;previousInstrumentId:UUID|null}):Promise<void>{
  if(actor.actorRole==='SURVEY_MANAGER')return;
  if(actor.actorRole==='PARTY_CHIEF'){
    if(members.partyChiefId!==actor.actorId||members.previousChiefId!==actor.actorId)
      throw new ForbiddenError('Only the assigned Party Chief may assign their Instrument Men.');
    if(members.instrumentManId){
      const {rows}=await db.query(`SELECT id FROM crew_rosters WHERE tenant_id=$1 AND project_id=$2
        AND party_chief_id=$3 AND instrument_man_id=$4 AND deactivated_at IS NULL FOR SHARE`,
        [scope.tenantId,scope.projectId,actor.actorId,members.instrumentManId]);
      if(!rows[0])throw new ForbiddenError('Choose an Instrument Man assigned to you. Ask the Survey Manager for a cross-team assignment.');
    }
    return;
  }
  if(actor.actorRole!=='SURVEY_SUPERINTENDENT')throw new ForbiddenError('Your role cannot assign survey work.');
  const ids=[members.partyChiefId,members.instrumentManId,members.previousChiefId,members.previousInstrumentId].filter((id):id is UUID=>!!id);
  const {rows}=await db.query(`SELECT coverage.team_id FROM
    (SELECT $1::uuid tenant_id,$2::uuid project_id,$3::uuid aor_node_id)t
    CROSS JOIN LATERAL (${surveyTeamCoverageQuery('$4','SURVEY_SUPERINTENDENT')})coverage
    WHERE NOT EXISTS(SELECT 1 FROM unnest($5::uuid[]) candidate(id) WHERE NOT EXISTS(
      SELECT 1 FROM survey_team_members member WHERE member.tenant_id=t.tenant_id AND member.project_id=t.project_id
      AND member.team_id=coverage.team_id AND member.user_id=candidate.id AND member.deactivated_at IS NULL)) LIMIT 1`,
    [scope.tenantId,scope.projectId,scope.aorNodeId,actor.actorId,ids]);
  if(!rows[0])throw new ForbiddenError('Choose surveyors from your team responsible for this Area. Only the Survey Manager may move work across teams.');
}
