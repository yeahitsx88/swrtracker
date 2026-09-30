import type { VisibilityScope } from '@/modules/ticket/application/ports';

/** Shared data-access predicate. Use only a server-resolved scope, with alias t,
 * and explicit tenant/project constraints in the enclosing query. */
export function buildVisibilityClause(scope: VisibilityScope, baseIdx: number): { sql: string; params: unknown[] } {
  const { actorId, actorRole, projectId, departmentId, aorNodeIds, partyChiefId, companyId, companyType } = scope;
  const isolate = (clause: { sql: string; params: unknown[] }) => {
    if (companyType !== 'SUBCONTRACTOR') return clause;
    const isolationSql = `AND t.company_id = $${baseIdx + clause.params.length}`;
    return { sql: clause.sql ? `${clause.sql} ${isolationSql}` : isolationSql, params: [...clause.params, companyId] };
  };
  switch (actorRole) {
    case 'SURVEY_MANAGER':
    case 'CAD_LEAD':
    case 'CAD_TECHNICIAN':
    case 'VIEWER':
      return isolate({ sql: '', params: [] });
    case 'SUBCONTRACTS_COORDINATOR':
      return isolate({ sql: "AND EXISTS (SELECT 1 FROM companies c WHERE c.id = t.company_id AND c.type = 'SUBCONTRACTOR')", params: [] });
    case 'REQUESTER':
      if (companyType === 'SUBCONTRACTOR' && projectId) {
        return {
          sql: `AND (t.requester_id = $${baseIdx} OR (
            t.company_id = $${baseIdx + 1} AND t.project_id = $${baseIdx + 2}
            AND EXISTS (
              SELECT 1 FROM company_authority_grants g
              JOIN project_memberships pm
                ON pm.project_id = g.project_id AND pm.user_id = g.user_id
              JOIN users u ON u.id = g.user_id AND u.tenant_id = g.tenant_id
              WHERE g.tenant_id = t.tenant_id AND g.project_id = t.project_id
                AND g.company_id = t.company_id AND g.user_id = $${baseIdx}
                AND g.revoked_at IS NULL AND pm.role = 'REQUESTER'
                AND u.deactivated_at IS NULL
            )
          ))`,
          params: [actorId, companyId, projectId],
        };
      }
      return isolate({ sql: `AND t.requester_id = $${baseIdx}`, params: [actorId] });
    case 'DEPARTMENT_MANAGER':
      return isolate(departmentId ? { sql: `AND t.department_id = $${baseIdx}`, params: [departmentId] } : { sql: 'AND 1 = 0', params: [] });
    case 'DEPARTMENT_LEAD':
      if (!departmentId || !aorNodeIds?.length) return isolate({ sql: 'AND 1 = 0', params: [] });
      return isolate({ sql: `AND t.department_id = $${baseIdx} AND t.aor_node_id IN (${aorNodeIds.map((_, i) => `$${baseIdx + i + 1}`).join(', ')})`, params: [departmentId, ...aorNodeIds] });
    case 'PARTY_CHIEF':
      return isolate({ sql: `AND t.assigned_party_chief_id = $${baseIdx}`, params: [actorId] });
    case 'INSTRUMENT_MAN':
      return isolate({ sql: `AND (t.assigned_party_chief_id = $${baseIdx} OR t.assigned_instrument_man_id = $${baseIdx + 1})`, params: [partyChiefId ?? actorId, actorId] });
    case 'SURVEY_SUPERINTENDENT':
    case 'AREA_VIEWER':
      if (!aorNodeIds?.length) return isolate({ sql: 'AND 1 = 0', params: [] });
      return isolate({ sql: `AND t.aor_node_id IN (${aorNodeIds.map((_, i) => `$${baseIdx + i}`).join(', ')})`, params: aorNodeIds });
    default:
      return isolate({ sql: 'AND 1 = 0', params: [] });
  }
}
