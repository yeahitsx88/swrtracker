import type { DbClient, UUID } from '@/shared/types';
import type { RequestOptions, RequestOptionsRepositoryPort } from
  '../application/request-options';

export class RequestOptionsRepository implements RequestOptionsRepositoryPort {
  async findForRequester(db: DbClient, tenantId: UUID, projectId: UUID,
    requesterId: UUID): Promise<RequestOptions | null> {
    const { rows: projects } = await db.query<{
      id: UUID; name: string; own_department_id: UUID | null;
    }>(
      `SELECT p.id, p.name, dm.department_id AS own_department_id
       FROM projects p
       JOIN users u ON u.id=$3 AND u.tenant_id=p.tenant_id
         AND u.deactivated_at IS NULL
       JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=u.id
         AND pm.role='REQUESTER'
       LEFT JOIN department_memberships dm ON dm.project_id=p.id
         AND dm.tenant_id=p.tenant_id AND dm.user_id=u.id
         AND dm.deactivated_at IS NULL
       WHERE p.tenant_id=$1 AND p.id=$2 AND p.status='ACTIVE'
       LIMIT 1`, [tenantId, projectId, requesterId]);
    const project = projects[0];
    if (!project) return null;

    const { rows: nodes } = await db.query<{
      id: UUID; name: string; code: string; level_label: string; path: string;
    }>(
      `WITH RECURSIVE paths AS (
         SELECT n.id, n.parent_id, n.name, n.code, n.retired_at,
           l.label AS level_label, n.name::text AS path
         FROM aor_nodes n
         JOIN aor_levels l ON l.id=n.level_id AND l.project_id=n.project_id
           AND l.tenant_id=n.tenant_id
         WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.parent_id IS NULL
         UNION ALL
         SELECT n.id, n.parent_id, n.name, n.code, n.retired_at,
           l.label AS level_label, paths.path || ' / ' || n.name AS path
         FROM aor_nodes n
         JOIN paths ON paths.id=n.parent_id
         JOIN aor_levels l ON l.id=n.level_id AND l.project_id=n.project_id
           AND l.tenant_id=n.tenant_id
         WHERE n.tenant_id=$1 AND n.project_id=$2
       )
       SELECT id, name, code, level_label, path FROM paths
       WHERE retired_at IS NULL ORDER BY path, id`, [tenantId, projectId]);
    const { rows: departments } = await db.query<{ id: UUID; name: string }>(
      `SELECT id, name FROM departments
       WHERE tenant_id=$1 AND project_id=$2 ORDER BY name, id`,
      [tenantId, projectId]);
    return {
      project: { id: project.id, name: project.name },
      ownDepartmentId: project.own_department_id,
      aorNodes: nodes.map(node => ({
        id: node.id, name: node.name, code: node.code,
        levelLabel: node.level_label, path: node.path,
      })),
      departments,
    };
  }
}
