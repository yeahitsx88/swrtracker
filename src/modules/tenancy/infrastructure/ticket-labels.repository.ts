import type { DbClient } from '@/shared/types';
import type { TicketLabelContext, TicketLabels, TicketLabelsPort } from '../application/ticket-labels';

export class TicketLabelsRepository implements TicketLabelsPort {
  async find(db: DbClient, context: TicketLabelContext): Promise<TicketLabels | null> {
    const { rows } = await db.query<TicketLabels>(
      `WITH RECURSIVE location AS (
         SELECT id, parent_id, name::text AS path, ARRAY[id] AS visited
         FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 AND id=$3
         UNION ALL
         SELECT n.id, n.parent_id, n.name || ' / ' || location.path,
           location.visited || n.id
         FROM aor_nodes n JOIN location ON n.id=location.parent_id
         WHERE n.tenant_id=$1 AND n.project_id=$2 AND NOT n.id=ANY(location.visited)
       )
       SELECT p.name AS "projectName",
         (SELECT path FROM location WHERE parent_id IS NULL) AS "locationName",
         d.name AS "departmentName"
       FROM projects p LEFT JOIN departments d ON d.id=$4
         AND d.project_id=p.id AND d.tenant_id=p.tenant_id
       WHERE p.tenant_id=$1 AND p.id=$2`,
      [context.tenantId, context.projectId, context.aorNodeId, context.departmentId]);
    return rows[0] ?? null;
  }
}
