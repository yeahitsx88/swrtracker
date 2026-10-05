/** Correlated to a tenant/project-scoped ticket alias `t`. Parameters come from server code only. */
export function surveyTeamCoverageQuery(actorParameter:string,role:'SURVEY_SUPERINTENDENT'|'PARTY_CHIEF'|'INSTRUMENT_MAN'):string {
  return `SELECT st.id AS team_id,ta.area_id,st.row_version
    FROM survey_team_members m
    JOIN survey_teams st ON st.tenant_id=m.tenant_id AND st.project_id=m.project_id AND st.id=m.team_id
    JOIN survey_team_areas ta ON ta.tenant_id=st.tenant_id AND ta.project_id=st.project_id AND ta.team_id=st.id
    JOIN project_memberships pm ON pm.project_id=m.project_id AND pm.user_id=m.user_id
    JOIN users u ON u.tenant_id=m.tenant_id AND u.id=m.user_id
    JOIN companies c ON c.tenant_id=u.tenant_id AND c.id=u.company_id
    WHERE m.tenant_id=t.tenant_id AND m.project_id=t.project_id AND m.user_id=${actorParameter}
      AND st.deactivated_at IS NULL AND m.deactivated_at IS NULL AND ta.deactivated_at IS NULL
      AND pm.access_disabled_at IS NULL AND pm.role='${role}' AND u.deactivated_at IS NULL AND c.type<>'SUBCONTRACTOR'
      ${role==='SURVEY_SUPERINTENDENT'?`AND st.lead_user_id=${actorParameter}`:''}
      AND ta.area_id IN (WITH RECURSIVE ancestors AS (
        SELECT n.id,n.parent_id FROM aor_nodes n WHERE n.tenant_id=t.tenant_id AND n.project_id=t.project_id AND n.id=t.aor_node_id AND n.retired_at IS NULL
        UNION SELECT n.id,n.parent_id FROM aor_nodes n JOIN ancestors a ON a.parent_id=n.id
        WHERE n.tenant_id=t.tenant_id AND n.project_id=t.project_id AND n.retired_at IS NULL
      ) SELECT id FROM ancestors)`;
}
