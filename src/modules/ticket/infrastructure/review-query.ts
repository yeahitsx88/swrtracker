import type { ReviewOptions } from '../application/review-tickets';
import { ticketFilterClause } from './ticket-filter-clause';

/** All aggregations, facets and page rows descend from the same authorized CTE. */
export function buildReviewQuery(tenantId: string, options: ReviewOptions, visibility: { sql: string; params: unknown[] }) {
  const params: unknown[] = [tenantId, options.projectId, ...visibility.params];
  const filter = ticketFilterClause(options.filters, params.length + 1);
  params.push(...filter.params);
  const conditions = filter.sql ? [filter.sql] : [];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  const date = options.filters.dateBasis === 'completed' ? 't.completed_at' : options.filters.dateBasis === 'submitted' ? 'COALESCE(t.first_submitted_at, t.submitted_at)' : 't.requested_date';
  const limit = bind(options.limit), offset = bind(options.offset);
  const order = options.sort === 'oldest' ? 't.created_at ASC, t.id ASC' : options.sort === 'needBy' ? 't.requested_date ASC, t.id ASC' : 't.created_at DESC, t.id DESC';
  const buckets = (source: string, column: string, join = '', label = `t.${column}`) => `(SELECT COALESCE(jsonb_agg(b ORDER BY b.count DESC, b.label, b.key), '[]'::jsonb) FROM
    (SELECT t.${column}::text AS key, ${label} AS label, COUNT(*)::int AS count FROM ${source} t ${join}
     WHERE t.${column} IS NOT NULL GROUP BY t.${column}, ${label}) b)`;
  const areaJoin = 'JOIN aor_nodes n ON n.id=t.aor_node_id AND n.tenant_id=t.tenant_id AND n.project_id=t.project_id';
  // Inline authorization so PostgreSQL retains table statistics for combined filters.
  // Materializing this boundary made a 6,550-row selection look like one row,
  // producing a quadratic nested-loop provenance join on PostgreSQL 15.
  return { params, sql: `WITH authorized AS NOT MATERIALIZED (
      SELECT t.* FROM tickets t WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.status <> 'DRAFT' ${visibility.sql}
    ), filtered AS MATERIALIZED (SELECT t.* FROM authorized t WHERE ${conditions.join(' AND ') || 'TRUE'}),
    provenance AS (SELECT DISTINCT e.ticket_id, e.payload->>'completionDateGenerated' = 'true' AS simulated
      FROM ticket_events e JOIN filtered t ON t.id=e.ticket_id AND t.tenant_id=e.tenant_id
      WHERE e.tenant_id=$1 AND e.payload->>'importSnapshot'='true')
    SELECT jsonb_build_object(
      'total', (SELECT COUNT(*) FROM filtered),
      'completed', (SELECT COUNT(*) FROM filtered WHERE status='COMPLETED'),
      'canceled', (SELECT COUNT(*) FROM filtered WHERE status IN ('SURVEY_CANCELED','FIELD_CANCELED','REQUESTER_CANCELED')),
      'open', (SELECT COUNT(*) FROM filtered WHERE status NOT IN ('COMPLETED','SURVEY_CANCELED','FIELD_CANCELED','REQUESTER_CANCELED','REJECTED')),
      'firstDate', (SELECT MIN(requested_date) FROM filtered), 'lastDate', (SELECT MAX(requested_date) FROM filtered),
      'imported', (SELECT COUNT(DISTINCT ticket_id) FROM provenance),
      'simulatedCompletions', (SELECT COUNT(DISTINCT ticket_id) FROM provenance WHERE simulated),
      'statuses', ${buckets('filtered', 'status')}, 'types', ${buckets('filtered', 'ticket_type')},
      'areas', ${buckets('filtered', 'aor_node_id', areaJoin, 'n.name')},
      'months', (SELECT COALESCE(jsonb_agg(m ORDER BY m.key), '[]'::jsonb) FROM
        (SELECT to_char(${date} AT TIME ZONE 'UTC', 'YYYY-MM') AS key, to_char(${date} AT TIME ZONE 'UTC', 'YYYY-MM') AS label, COUNT(*)::int AS count
         FROM filtered t WHERE ${date} IS NOT NULL GROUP BY 1,2 ORDER BY 1 DESC LIMIT 120) m),
      'facets', jsonb_build_object('statuses', ${buckets('authorized', 'status')}, 'types', ${buckets('authorized', 'ticket_type')},
        'areas', ${buckets('authorized', 'aor_node_id', areaJoin, 'n.name')},
        'crews', ${buckets('authorized', 'assigned_party_chief_id', 'JOIN users u ON u.id=t.assigned_party_chief_id AND u.tenant_id=t.tenant_id', 'u.name')}),
      'items', (SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) FROM
        (SELECT t.id, t.ticket_number AS number, t.description, t.status, t.ticket_type AS type,
          n.name AS area, u.name AS requester, c.name AS crew, t.requested_date AS "needBy", t.completed_at AS "completedAt"
         FROM filtered t JOIN aor_nodes n ON n.id=t.aor_node_id AND n.tenant_id=t.tenant_id AND n.project_id=t.project_id
         JOIN users u ON u.id=t.requester_id AND u.tenant_id=t.tenant_id
         LEFT JOIN users c ON c.id=t.assigned_party_chief_id AND c.tenant_id=t.tenant_id
         ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}) p)
    ) AS result` };
}
