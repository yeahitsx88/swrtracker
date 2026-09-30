import type { DbClient, Page, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { ConflictError } from '@/shared/errors';
import type { SaveSurveyTeamInput, SurveyTeamDetail, SurveyTeamSummary, SurveyTeamsRepository,
  TeamActor, TeamEvent, TeamPageQuery, TeamPersonnel, TeamPerson, TeamProjectContext, TeamArea } from '../application/survey-teams';
import { SurveyStaffingPgRepository } from './survey-staffing.repository';
import type { ChangeSurveyRoleInput, SurveyRoleObligations, SurveyRoleRepository } from '../application/change-survey-role';

interface TeamRow {
  id: UUID; name: string; aor_node_id: UUID; area_name: string; lead_user_id: UUID;
  lead_name: string; lead_email: string; lead_role: ProjectRole; lead_active: boolean;
  member_count: number; row_version: number;
}
interface PersonRow {
  user_id: UUID; name: string; email: string; role: ProjectRole; active: boolean; team_id: UUID | null; team_name: string | null; role_version: number;
}
const summary = (row: TeamRow): SurveyTeamSummary => ({
  id: row.id, name: row.name, areaId: row.aor_node_id, areaName: row.area_name,
  lead: { userId: row.lead_user_id, name: row.lead_name, email: row.lead_email, role: row.lead_role, active: row.lead_active },
  memberCount: row.member_count, rowVersion: row.row_version,
});
const person = (row: PersonRow): TeamPerson => ({ userId: row.user_id, name: row.name, email: row.email, role: row.role, active: row.active });
const teamSelect = `SELECT t.id,t.name,t.aor_node_id,n.name AS area_name,t.lead_user_id,
  u.name AS lead_name,u.email AS lead_email,pm.role AS lead_role,u.deactivated_at IS NULL AS lead_active,
  t.row_version,(SELECT COUNT(*)::int FROM survey_team_members m
    WHERE m.tenant_id=t.tenant_id AND m.project_id=t.project_id AND m.team_id=t.id AND m.deactivated_at IS NULL) AS member_count
  FROM survey_teams t
  JOIN projects p ON p.tenant_id=t.tenant_id AND p.id=t.project_id
  JOIN aor_nodes n ON n.tenant_id=t.tenant_id AND n.project_id=t.project_id AND n.id=t.aor_node_id
  JOIN users u ON u.tenant_id=t.tenant_id AND u.id=t.lead_user_id
  JOIN project_memberships pm ON pm.project_id=t.project_id AND pm.user_id=t.lead_user_id
  WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.deactivated_at IS NULL`;

export class SurveyTeamsPgRepository extends SurveyStaffingPgRepository implements SurveyTeamsRepository, SurveyRoleRepository {
  async projectContext(db: DbClient, tenantId: UUID, projectId: UUID): Promise<TeamProjectContext | null> {
    const { rows } = await db.query<TeamProjectContext>(
      `SELECT status,crew_build AS "crewBuild" FROM projects WHERE tenant_id=$1 AND id=$2`, [tenantId,projectId]);
    return rows[0] ?? null;
  }

  async areas(db: DbClient, tenantId: UUID, projectId: UUID, query: TeamPageQuery) {
    const from = `FROM aor_nodes n JOIN aor_levels l ON l.tenant_id=n.tenant_id AND l.project_id=n.project_id AND l.id=n.level_id
      WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.retired_at IS NULL AND l.depth=0 AND n.name ILIKE $3`;
    const values = [tenantId,projectId,`%${query.search}%`];
    const count = await db.query<{ total: number }>(`SELECT COUNT(*)::int AS total ${from}`,values);
    const { rows } = await db.query<TeamArea>(`SELECT n.id,n.name ${from} ORDER BY lower(n.name),n.id LIMIT $4 OFFSET $5`,[...values,query.limit,query.offset]);
    return { data: rows, total: count.rows[0]!.total, limit: query.limit, offset: query.offset };
  }

  override async activeArea(db: DbClient, tenantId: UUID, projectId: UUID, areaId: UUID): Promise<boolean> {
    const { rows } = await db.query<{ id: UUID }>(
      `SELECT n.id FROM aor_nodes n JOIN aor_levels l ON l.id=n.level_id AND l.project_id=n.project_id AND l.tenant_id=n.tenant_id
       WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.id=$3 AND n.retired_at IS NULL AND l.depth=0 FOR SHARE OF n`,
      [tenantId, projectId, areaId]);
    return rows.length === 1;
  }
  async lockManager(db: DbClient, actor: TeamActor): Promise<boolean> {
    // Hold the project authority row, not the caller's global account row.
    // Subjects are locked separately in stable user-ID order. Holding a caller
    // account here creates actor/subject lock inversion across two projects.
    // Session validity is checked at authorization time like other API calls.
    const { rows } = await db.query<{ user_id: UUID }>(
      `SELECT pm.user_id FROM project_memberships pm
       JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
       JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
       JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id AND c.type<>'SUBCONTRACTOR'
       WHERE pm.project_id=$2 AND pm.user_id=$3 AND pm.role='SURVEY_MANAGER'
         AND u.deactivated_at IS NULL AND u.session_version=$4 FOR UPDATE OF pm`,
      [actor.tenantId, actor.projectId, actor.actorId, actor.sessionVersion]);
    return rows.length === 1;
  }

  async team(db: DbClient, tenantId: UUID, projectId: UUID, teamId: UUID): Promise<SurveyTeamDetail | null> {
    const { rows } = await db.query<TeamRow>(`${teamSelect} AND t.id=$3`, [tenantId, projectId, teamId]);
    if (!rows[0]) return null;
    const members = await db.query<PersonRow>(
      `SELECT u.id AS user_id,u.name,u.email,pm.role,u.deactivated_at IS NULL AS active,
         m.team_id,t.name AS team_name FROM survey_team_members m
       JOIN survey_teams t ON t.tenant_id=m.tenant_id AND t.project_id=m.project_id AND t.id=m.team_id
       JOIN users u ON u.tenant_id=m.tenant_id AND u.id=m.user_id
       JOIN project_memberships pm ON pm.project_id=m.project_id AND pm.user_id=m.user_id
       WHERE m.tenant_id=$1 AND m.project_id=$2 AND m.team_id=$3 AND m.deactivated_at IS NULL
       ORDER BY pm.role,u.name,u.id`, [tenantId, projectId, teamId]);
    return { ...summary(rows[0]), members: members.rows.map(person) };
  }

  async list(db: DbClient, tenantId: UUID, projectId: UUID, query: TeamPageQuery): Promise<Page<SurveyTeamSummary>> {
    const search = `%${query.search}%`;
    const filter = ` AND (t.name ILIKE $3 OR n.name ILIKE $3)`;
    const count = await db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM survey_teams t
       JOIN aor_nodes n ON n.tenant_id=t.tenant_id AND n.project_id=t.project_id AND n.id=t.aor_node_id
       WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.deactivated_at IS NULL${filter}`, [tenantId, projectId, search]);
    const { rows } = await db.query<TeamRow>(`${teamSelect}${filter} ORDER BY lower(t.name),t.id LIMIT $4 OFFSET $5`,
      [tenantId, projectId, search, query.limit, query.offset]);
    return { data: rows.map(summary), total: count.rows[0]!.total, limit: query.limit, offset: query.offset };
  }

  async personnel(db: DbClient, tenantId: UUID, projectId: UUID, query: TeamPageQuery): Promise<Page<TeamPersonnel>> {
    const from = `FROM project_memberships pm
      JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
      JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id AND u.deactivated_at IS NULL
      JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id AND c.type<>'SUBCONTRACTOR'
      WHERE pm.project_id=$2 AND pm.role IN ('REQUESTER','VIEWER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN')
        AND (u.name ILIKE $3 OR u.email ILIKE $3 OR pm.role ILIKE $3 OR replace(pm.role,'_',' ') ILIKE $3)`;
    const values = [tenantId, projectId, `%${query.search}%`];
    const count = await db.query<{ total: number }>(`SELECT COUNT(*)::int AS total ${from}`, values);
    const { rows } = await db.query<PersonRow>(
      `SELECT u.id AS user_id,u.name,u.email,pm.role,TRUE AS active,u.session_version AS role_version,
         (SELECT m.team_id FROM survey_team_members m WHERE m.tenant_id=$1 AND m.project_id=$2 AND m.user_id=u.id AND m.deactivated_at IS NULL) AS team_id,
         (SELECT t.name FROM survey_team_members m JOIN survey_teams t ON t.tenant_id=m.tenant_id AND t.project_id=m.project_id AND t.id=m.team_id
          WHERE m.tenant_id=$1 AND m.project_id=$2 AND m.user_id=u.id AND m.deactivated_at IS NULL) AS team_name
       ${from} ORDER BY lower(u.name),u.id LIMIT $4 OFFSET $5`, [...values, query.limit, query.offset]);
    return { data: rows.map(row => ({ ...person(row), teamId: row.team_id, teamName: row.team_name, roleVersion: row.role_version })),
      total: count.rows[0]!.total, limit: query.limit, offset: query.offset };
  }

  async members(db: DbClient, tenantId: UUID, projectId: UUID, userIds: UUID[]): Promise<TeamPersonnel[]> {
    // Non-key writes still serialize, while audit foreign-key KEY SHARE locks
    // remain compatible when Managers edit each other in different projects.
    const { rows } = await db.query<PersonRow>(
      `SELECT u.id AS user_id,u.name,u.email,pm.role,TRUE AS active,u.session_version AS role_version,m.team_id,t.name AS team_name
       FROM project_memberships pm JOIN projects p ON p.id=pm.project_id AND p.tenant_id=$1
       JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id AND u.deactivated_at IS NULL
       JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id AND c.type<>'SUBCONTRACTOR'
       LEFT JOIN survey_team_members m ON m.tenant_id=$1 AND m.project_id=$2 AND m.user_id=u.id AND m.deactivated_at IS NULL
       LEFT JOIN survey_teams t ON t.tenant_id=m.tenant_id AND t.project_id=m.project_id AND t.id=m.team_id
       WHERE pm.project_id=$2 AND u.id=ANY($3::uuid[]) ORDER BY u.id FOR NO KEY UPDATE OF pm,u`, [tenantId, projectId, userIds]);
    return rows.map(row => ({ ...person(row), teamId: row.team_id, teamName: row.team_name, roleVersion: row.role_version }));
  }

  async roleObligations(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID): Promise<SurveyRoleObligations> {
    const { rows } = await db.query<SurveyRoleObligations>(
      `SELECT
       EXISTS(SELECT 1 FROM survey_teams WHERE tenant_id=$1 AND project_id=$2 AND lead_user_id=$3 AND deactivated_at IS NULL) AS "leadsTeam",
       (SELECT COUNT(*)::int FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND deactivated_at IS NULL) AS "areaAssignments",
       (SELECT COUNT(*)::int FROM crew_rosters WHERE tenant_id=$1 AND project_id=$2 AND (party_chief_id=$3 OR instrument_man_id=$3) AND deactivated_at IS NULL) AS "crewLinks",
       (SELECT COUNT(*)::int FROM survey_reporting_links WHERE tenant_id=$1 AND project_id=$2 AND (superintendent_id=$3 OR party_chief_id=$3) AND deactivated_at IS NULL) AS "reportingLinks",
       (SELECT COUNT(*)::int FROM project_responsibility_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND revoked_at IS NULL) AS "responsibilityGrants",
       (SELECT COUNT(*)::int FROM acting_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND revoked_at IS NULL) AS "actingGrants"`,
      [tenantId, projectId, userId]);
    return rows[0]!;
  }

  async changeOperationalRole(db: DbClient, actor: TeamActor, input: ChangeSurveyRoleInput): Promise<number> {
    const membership = await db.query<{ user_id: UUID }>(
      `UPDATE project_memberships pm SET role=$4 WHERE pm.project_id=$2 AND pm.user_id=$3 AND pm.role=$5
       AND EXISTS(SELECT 1 FROM projects p WHERE p.id=pm.project_id AND p.tenant_id=$1)
       RETURNING pm.user_id`, [actor.tenantId, actor.projectId, input.userId, input.role, input.expectedRole]);
    if (!membership.rows[0]) throw new ConflictError('This person’s role changed; reload before saving', 'STALE_SURVEY_ROLE');
    const user = await db.query<{ session_version: number }>(
      `UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2
       AND session_version=$3 AND deactivated_at IS NULL RETURNING session_version`, [actor.tenantId, input.userId, input.expectedRoleVersion]);
    if (!user.rows[0]) throw new ConflictError('This person’s account changed; reload before saving', 'STALE_SURVEY_ROLE');
    return user.rows[0].session_version;
  }

  async nameExists(db: DbClient, tenantId: UUID, projectId: UUID, name: string, exceptTeamId: UUID | null): Promise<boolean> {
    const { rows } = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM survey_teams WHERE tenant_id=$1 AND project_id=$2
       AND lower(btrim(name))=lower(btrim($3)) AND deactivated_at IS NULL AND ($4::uuid IS NULL OR id<>$4)) AS exists`,
      [tenantId, projectId, name, exceptTeamId]);
    return rows[0]!.exists;
  }

  async save(db: DbClient, actor: TeamActor, teamId: UUID, input: SaveSurveyTeamInput, previous: SurveyTeamDetail | null): Promise<void> {
    const values = [actor.tenantId, actor.projectId, teamId, input.name, input.areaId, input.leadUserId];
    if (previous) {
      const { rows } = await db.query<{ id: UUID }>(
        `UPDATE survey_teams SET name=$4,aor_node_id=$5,lead_user_id=$6,row_version=row_version+1,updated_at=NOW()
         WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND row_version=$7 AND deactivated_at IS NULL RETURNING id`, [...values, previous.rowVersion]);
      if (!rows[0]) throw new ConflictError('This team changed; reload before saving', 'STALE_TEAM');
    } else await db.query(
      `INSERT INTO survey_teams (tenant_id,project_id,id,name,aor_node_id,lead_user_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`, [...values, actor.actorId]);
    await db.query(
      `UPDATE survey_team_members SET deactivated_at=NOW() WHERE tenant_id=$1 AND project_id=$2 AND team_id=$3
       AND deactivated_at IS NULL AND NOT(user_id=ANY($4::uuid[]))`, [actor.tenantId, actor.projectId, teamId, input.memberIds]);
    await db.query(
      `INSERT INTO survey_team_members (tenant_id,project_id,team_id,user_id)
       SELECT $1,$2,$3,unnest($4::uuid[])
       ON CONFLICT (tenant_id,project_id,team_id,user_id) DO UPDATE SET
         assigned_at=CASE WHEN survey_team_members.deactivated_at IS NOT NULL THEN NOW() ELSE survey_team_members.assigned_at END,
         deactivated_at=NULL`, [actor.tenantId, actor.projectId, teamId, input.memberIds]);
  }

  async deactivate(db: DbClient, actor: TeamActor, team: SurveyTeamDetail): Promise<void> {
    const { rows } = await db.query<{ id: UUID }>(`UPDATE survey_teams SET deactivated_at=NOW(),updated_at=NOW(),row_version=row_version+1
      WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND row_version=$4 AND deactivated_at IS NULL RETURNING id`, [actor.tenantId, actor.projectId, team.id, team.rowVersion]);
    if (!rows[0]) throw new ConflictError('This team changed; reload before deleting', 'STALE_TEAM');
    await db.query(`UPDATE survey_team_members SET deactivated_at=NOW()
      WHERE tenant_id=$1 AND project_id=$2 AND team_id=$3 AND deactivated_at IS NULL`, [actor.tenantId, actor.projectId, team.id]);
  }

  async recordTeamEvent(db: DbClient, actor: TeamActor, event: TeamEvent, payload: Record<string, unknown>): Promise<void> {
    await db.query(`INSERT INTO survey_staffing_events (tenant_id,project_id,actor_id,event_type,payload)
      VALUES ($1,$2,$3,$4,$5::jsonb)`, [actor.tenantId, actor.projectId, actor.actorId, event, JSON.stringify(payload)]);
  }
}
