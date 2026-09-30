import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { CrewBuild, ProjectStatus } from '../domain/types';
import type { SurveyStaffingMember, SurveyStaffingRepository } from '../application/save-survey-staffing';

export class SurveyStaffingPgRepository implements SurveyStaffingRepository {
  async lockProject(db: DbClient, tenantId: UUID, projectId: UUID): Promise<{ status: ProjectStatus; crewBuild: CrewBuild } | null> {
    const { rows } = await db.query<{ status: ProjectStatus; crew_build: CrewBuild }>(
      `SELECT status, crew_build FROM projects WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId, projectId]);
    return rows[0] ? { status: rows[0].status, crewBuild: rows[0].crew_build } : null;
  }

  async member(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID): Promise<SurveyStaffingMember | null> {
    const { rows } = await db.query<{ user_id: UUID; role: ProjectRole }>(
      `SELECT pm.user_id, pm.role FROM project_memberships pm
       JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
       JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id AND u.deactivated_at IS NULL
       JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id AND c.type<>'SUBCONTRACTOR'
       WHERE pm.project_id=$2 AND pm.user_id=$3 FOR UPDATE OF pm`, [tenantId, projectId, userId]);
    return rows[0] ? { userId: rows[0].user_id, role: rows[0].role } : null;
  }

  async activeArea(db: DbClient, tenantId: UUID, projectId: UUID, areaId: UUID): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `SELECT n.id FROM aor_nodes n JOIN aor_levels l ON l.id=n.level_id AND l.project_id=n.project_id
       WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.id=$3 AND n.retired_at IS NULL AND l.depth=0`,
      [tenantId, projectId, areaId]);
    return rows.length > 0;
  }

  async superintendentCoversArea(db: DbClient, tenantId: UUID, projectId: UUID, superintendentId: UUID, areaId: UUID): Promise<boolean> {
    const { rows } = await db.query<{ covered: boolean }>(
      `WITH RECURSIVE ancestors AS (
         SELECT id, parent_id FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 AND id=$4 AND retired_at IS NULL
         UNION ALL
         SELECT parent.id, parent.parent_id FROM aor_nodes parent JOIN ancestors child ON child.parent_id=parent.id
         WHERE parent.tenant_id=$1 AND parent.project_id=$2 AND parent.retired_at IS NULL
       ) SELECT EXISTS (
         SELECT 1 FROM aor_assignments aa JOIN ancestors a ON a.id=aa.aor_node_id
         WHERE aa.tenant_id=$1 AND aa.project_id=$2 AND aa.user_id=$3 AND aa.deactivated_at IS NULL
       ) AS covered`, [tenantId, projectId, superintendentId, areaId]);
    return rows[0]?.covered ?? false;
  }

  async activeAreasForUser(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID): Promise<UUID[]> {
    const { rows } = await db.query<{ aor_node_id: UUID }>(
      `SELECT DISTINCT aor_node_id FROM aor_assignments
       WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL`,
      [tenantId, projectId, userId]);
    return rows.map(row => row.aor_node_id);
  }

  async rosterChief(db: DbClient, tenantId: UUID, projectId: UUID, instrumentManId: UUID): Promise<UUID | null> {
    const { rows } = await db.query<{ party_chief_id: UUID }>(
      `SELECT party_chief_id FROM crew_rosters
       WHERE tenant_id=$1 AND project_id=$2 AND instrument_man_id=$3 AND deactivated_at IS NULL FOR UPDATE`,
      [tenantId, projectId, instrumentManId]);
    return rows[0]?.party_chief_id ?? null;
  }

  async changeRole(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID, role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN'): Promise<void> {
    await db.query(
      `UPDATE project_memberships SET role=$4 WHERE project_id=$2 AND user_id=$3
       AND EXISTS (SELECT 1 FROM projects WHERE id=$2 AND tenant_id=$1)`,
      [tenantId, projectId, userId, role]);
    await db.query(`UPDATE users SET session_version=COALESCE(session_version,1)+1 WHERE tenant_id=$1 AND id=$2`, [tenantId, userId]);
  }

  async addArea(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID, areaId: UUID): Promise<void> {
    await db.query(
      `INSERT INTO aor_assignments (project_id,tenant_id,user_id,aor_node_id)
       VALUES ($1,$2,$3,$4)`, [projectId, tenantId, userId, areaId]);
  }

  async setReportingLink(db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID, partyChiefId: UUID, superintendentId: UUID | null, areaId: UUID): Promise<{ changed: boolean; previousSuperintendentId: UUID | null; previousAreaId: UUID | null }> {
    const { rows } = await db.query<{ superintendent_id: UUID; aor_node_id: UUID }>(
      `SELECT superintendent_id,aor_node_id FROM survey_reporting_links
       WHERE tenant_id=$1 AND project_id=$2 AND party_chief_id=$3 AND deactivated_at IS NULL FOR UPDATE`,
      [tenantId, projectId, partyChiefId]);
    const current = rows[0];
    const previous = { previousSuperintendentId: current?.superintendent_id ?? null, previousAreaId: current?.aor_node_id ?? null };
    if ((!current && !superintendentId) ||
        (current && current.superintendent_id === superintendentId && current.aor_node_id === areaId)) return { changed: false, ...previous };
    if (current) await db.query(
      `UPDATE survey_reporting_links SET deactivated_at=NOW()
       WHERE tenant_id=$1 AND project_id=$2 AND party_chief_id=$3 AND deactivated_at IS NULL`,
      [tenantId, projectId, partyChiefId]);
    if (superintendentId) await db.query(
      `INSERT INTO survey_reporting_links (tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by)
       VALUES ($1,$2,$3,$4,$5,$6)`, [tenantId, projectId, superintendentId, partyChiefId, areaId, actorId]);
    return { changed: true, ...previous };
  }

  async addInstrumentMan(db: DbClient, tenantId: UUID, projectId: UUID, partyChiefId: UUID, instrumentManId: UUID): Promise<void> {
    await db.query(
      `INSERT INTO crew_rosters (tenant_id,project_id,party_chief_id,instrument_man_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (project_id,instrument_man_id) DO UPDATE
       SET party_chief_id=EXCLUDED.party_chief_id,deactivated_at=NULL`,
      [tenantId, projectId, partyChiefId, instrumentManId]);
  }

  async record(db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID, payload: Record<string, unknown>): Promise<void> {
    await db.query(
      `INSERT INTO survey_staffing_events (tenant_id,project_id,actor_id,event_type,payload)
       VALUES ($1,$2,$3,'survey.staffing_saved',$4::jsonb)`,
      [tenantId, projectId, actorId, JSON.stringify(payload)]);
  }
}
