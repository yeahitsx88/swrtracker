import type { DbClient, UUID } from '@/shared/types';
import { ConflictError } from '@/shared/errors';
import type { NewSurveyArea, SurveyAreaRepository } from '../application/create-survey-area';
import type { TeamActor, TeamArea } from '../application/survey-teams';
import { SurveyTeamsPgRepository } from './survey-teams.repository';

export class SurveyAreasPgRepository extends SurveyTeamsPgRepository implements SurveyAreaRepository {
  async createArea(db: DbClient, actor: TeamActor, input: NewSurveyArea): Promise<TeamArea> {
    const {tenantId,projectId}=actor;
    const duplicate = await db.query(`SELECT id FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2
      AND (upper(code)=$3 OR (retired_at IS NULL AND lower(btrim(name))=lower($4))) LIMIT 1`,[tenantId,projectId,input.code,input.name]);
    if (duplicate.rows.length) throw new ConflictError('An Area already uses this name or code. Reload the Areas and choose a different name or code.');
    const existing = await db.query<{id:UUID}>('SELECT id FROM aor_levels WHERE tenant_id=$1 AND project_id=$2 AND depth=0',[tenantId,projectId]);
    // Normally created during project setup. An empty project receives its first root level here.
    const levelId = existing.rows[0]?.id ?? (await db.query<{id:UUID}>(
      `INSERT INTO aor_levels(tenant_id,project_id,depth,label) VALUES($1,$2,0,'Area') RETURNING id`,[tenantId,projectId])).rows[0]!.id;
    const result = await db.query<TeamArea>(`INSERT INTO aor_nodes(tenant_id,project_id,level_id,name,code)
      VALUES($1,$2,$3,$4,$5) RETURNING id,name`,[tenantId,projectId,levelId,input.name,input.code]);
    return result.rows[0]!;
  }
}
