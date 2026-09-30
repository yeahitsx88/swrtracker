import type { DbClient } from '@/shared/types';
import type { AmeliaMetrics, MetricsReader, MetricsScope } from '../application/amelia-metrics';
import { canAnalyzeSurveyPersonnel } from '../application/metrics-filters';
import { buildVisibilityClause } from '@/lib/ticket-visibility-clause';
import { metricsFilterClause } from './metrics-filter-clause';

/** Shared bounded aggregate result; charts never receive request detail rows. */
export function buildMetricsQuery(scope: MetricsScope) {
  const visibility = buildVisibilityClause(scope.visibility, 5);
  const filters = metricsFilterClause(scope.filters ?? {}, 5 + visibility.params.length);
  const denominator = metricsFilterClause({ ...scope.filters, population: 'all' }, 5 + visibility.params.length + filters.params.length);
  const terminal = ['COMPLETED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED', 'REJECTED'];
  const personnel = canAnalyzeSurveyPersonnel(scope.visibility.actorRole);
  const areaJoin = 'LEFT JOIN aor_nodes n ON n.id=t.aor_node_id AND n.tenant_id=$1 AND n.project_id=$2';
  const personJoin = (column: string) => `LEFT JOIN users u ON u.id=t.${column} AND u.tenant_id=$1`;
  const grouped = (column: string, label: string, join = '', cell = false) => `(
    SELECT COALESCE(jsonb_agg(b ORDER BY b.count DESC, b.label, b.key), '[]'::jsonb)
    FROM (SELECT COALESCE(t.${column}::text, '__unassigned__') AS key, ${label} AS label,
      COUNT(*)::int AS count, AVG(t.cycle_hours) AS "cycleHours", COUNT(t.cycle_hours)::int AS "cycleSamples"
      ${cell ? ', t.status' : ''}
      FROM measured t ${join} GROUP BY t.${column}, ${label} ${cell ? ', t.status' : ''}
      ORDER BY count DESC, label, key ${cell ? ', t.status' : ''} LIMIT 200) b
  )`;
  const facet = (column: string, label: string, join: string) => `(
    SELECT COALESCE(jsonb_agg(f ORDER BY f.label, f.key), '[]'::jsonb)
    FROM (SELECT DISTINCT t.${column}::text AS key, ${label} AS label
      FROM authorized t ${join} WHERE t.${column} IS NOT NULL ORDER BY label, key LIMIT 200) f
  )`;
  const date = scope.filters?.dateBasis === 'completed' ? "(t.completed_at AT TIME ZONE 'UTC')"
    : scope.filters?.dateBasis === 'submitted' ? "(COALESCE(t.first_submitted_at,t.submitted_at) AT TIME ZONE 'UTC')" : 't.requested_date::timestamp';
  const chartCtes = scope.includeCharts ? `, month_counts AS (
    SELECT date_trunc('month', ${date}) AS month, COUNT(*)::int AS count,
      AVG(cycle_hours) AS cycle_hours, COUNT(cycle_hours)::int AS cycle_samples
    FROM measured t WHERE ${date} IS NOT NULL GROUP BY 1
  ), months AS (
    SELECT s.month, COALESCE(m.count,0) AS count, m.cycle_hours, COALESCE(m.cycle_samples,0) AS cycle_samples
    FROM (SELECT generate_series(GREATEST(MIN(month), MAX(month) - INTERVAL '119 months'), MAX(month), INTERVAL '1 month') AS month FROM month_counts) s
    LEFT JOIN month_counts m ON m.month=s.month
  )` : '';
  const charts = scope.includeCharts ? `, 'charts', jsonb_build_object(
    'areas', ${grouped('aor_node_id', "COALESCE(n.name,'Unspecified Area')", areaJoin)},
    'types', ${grouped('ticket_type', 't.ticket_type')},
    'statuses', ${grouped('status', 't.status')},
    'crews', ${personnel ? grouped('assigned_party_chief_id', "COALESCE(u.name,'Unassigned')", personJoin('assigned_party_chief_id')) : "'[]'::jsonb"},
    'instrumentMen', ${personnel ? grouped('assigned_instrument_man_id', "COALESCE(u.name,'Unassigned')", personJoin('assigned_instrument_man_id')) : "'[]'::jsonb"},
    'cells', ${grouped('aor_node_id', "COALESCE(n.name,'Unspecified Area')", areaJoin, true)},
    'months', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'key',to_char(month,'YYYY-MM'),'label',to_char(month,'YYYY-MM'),'count',count,
      'cycleHours',cycle_hours,'cycleSamples',cycle_samples) ORDER BY month),'[]'::jsonb) FROM months),
    'facets', jsonb_build_object(
      'areas', ${facet('aor_node_id', 'n.name', areaJoin)},
      'crews', ${personnel ? facet('assigned_party_chief_id', 'u.name', personJoin('assigned_party_chief_id')) : "'[]'::jsonb"},
      'instrumentMen', ${personnel ? facet('assigned_instrument_man_id', 'u.name', personJoin('assigned_instrument_man_id')) : "'[]'::jsonb"}
    ),
    'limits', jsonb_build_object('groups',200,'months',120,'truncated',
      (SELECT COUNT(DISTINCT COALESCE(aor_node_id::text,'__unassigned__'))>200 OR ${personnel ? "COUNT(DISTINCT COALESCE(assigned_party_chief_id::text,'__unassigned__'))>200 OR COUNT(DISTINCT COALESCE(assigned_instrument_man_id::text,'__unassigned__'))>200 OR" : ''}
        FALSE FROM authorized)
      OR (SELECT COUNT(DISTINCT (aor_node_id,status))>200 FROM measured)
      OR (SELECT MAX(month) - MIN(month) > INTERVAL '119 months' FROM month_counts) IS TRUE)
  )` : '';
  return { params: [scope.tenantId, scope.projectId, terminal, scope.today ?? new Date().toISOString().slice(0,10), ...visibility.params, ...filters.params, ...denominator.params], sql: `
    WITH authorized AS NOT MATERIALIZED (
      SELECT t.id, t.tenant_id, t.aor_node_id, t.status, t.assigned_instrument_man_id,
        t.assigned_party_chief_id, t.ticket_type, t.requested_date, t.completed_at, t.first_submitted_at, t.submitted_at
      FROM tickets t WHERE t.tenant_id = $1 AND t.project_id = $2 AND t.status <> 'DRAFT' ${visibility.sql}
    ), filtered AS MATERIALIZED (
      SELECT t.* FROM authorized t WHERE ${filters.sql}
    ), provenance AS (
      SELECT e.ticket_id, bool_or(e.payload->>'completionDateGenerated'='true') AS synthetic
      FROM ticket_events e JOIN filtered t ON t.id=e.ticket_id AND t.tenant_id=e.tenant_id
      WHERE e.tenant_id=$1 AND e.payload->>'importSnapshot'='true' GROUP BY e.ticket_id
    ), measured AS MATERIALIZED (
      SELECT t.*, p.ticket_id IS NOT NULL AS imported, COALESCE(p.synthetic,false) AS synthetic,
        CASE WHEN t.status='COMPLETED' AND t.completed_at>=t.first_submitted_at AND NOT COALESCE(p.synthetic,false)
          THEN EXTRACT(EPOCH FROM (t.completed_at-t.first_submitted_at))/3600.0 END AS cycle_hours
      FROM filtered t LEFT JOIN provenance p ON p.ticket_id=t.id
    ), summary AS (
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE NOT (status=ANY($3::text[])))::int AS open_total,
        COUNT(*) FILTER (WHERE status='APPROVED' AND assigned_instrument_man_id IS NULL)::int AS approved_unassigned,
        COUNT(*) FILTER (WHERE NOT (status=ANY($3::text[])) AND requested_date<$4::date)::int AS overdue,
        COUNT(*) FILTER (WHERE status='COMPLETED')::int AS completed_total,
        AVG(cycle_hours) AS avg_cycle_hours, COUNT(cycle_hours)::int AS cycle_samples,
        COUNT(*) FILTER (WHERE imported)::int AS imported,
        COUNT(*) FILTER (WHERE status='COMPLETED' AND synthetic)::int AS synthetic_completions,
        COUNT(*) FILTER (WHERE status='COMPLETED' AND (completed_at IS NULL OR first_submitted_at IS NULL))::int AS missing_cycle_dates,
        COUNT(*) FILTER (WHERE status='COMPLETED' AND completed_at<first_submitted_at)::int AS invalid_cycle_dates,
        COUNT(*) FILTER (WHERE ${date} IS NULL)::int AS undated
      FROM measured t
    ), breakdown AS (
      SELECT a.id,a.name,t.status,COUNT(*)::int AS count FROM measured t
      JOIN aor_nodes a ON a.tenant_id=$1 AND a.project_id=$2 AND a.id=t.aor_node_id
      WHERE NOT(t.status=ANY($3::text[])) GROUP BY a.id,a.name,t.status
    ) ${chartCtes}
    SELECT jsonb_build_object(
      'total',total,'populationTotal',(SELECT COUNT(*) FROM authorized t WHERE ${denominator.sql}),
      'openTotal',open_total,'approvedWithoutInstrumentMan',approved_unassigned,
      'overdueNeedBy',overdue,'completedTotal',completed_total,'averageSubmissionToCompletionHours',avg_cycle_hours,
      'coverage',jsonb_build_object('imported',imported,'syntheticCompletions',synthetic_completions,
        'cycleSamples',cycle_samples,'missingCycleDates',missing_cycle_dates,'invalidCycleDates',invalid_cycle_dates,'undated',undated),
      'openByAreaStatus',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'areaId',id,'areaName',name,'status',status,'count',count) ORDER BY name,status) FROM breakdown),'[]'::jsonb)
      ${charts}
    ) AS metrics FROM summary` };
}

export class AmeliaMetricsReader implements MetricsReader {
  async read(db: DbClient, scope: MetricsScope): Promise<AmeliaMetrics> {
    const query = buildMetricsQuery(scope);
    const { rows } = await db.query<{ metrics: AmeliaMetrics }>(query.sql,query.params);
    if (!rows[0]) throw new Error('Metrics aggregate query returned no result');
    return rows[0].metrics;
  }
}
