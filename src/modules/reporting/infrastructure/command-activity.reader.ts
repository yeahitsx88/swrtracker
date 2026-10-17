import type { DbClient } from '@/shared/types';
import type { CommandActivity, CommandActivityReader, CommandActivityScope } from '../application/command-activity';
import { buildVisibilityClause } from '@/lib/ticket-visibility-clause';
import { metricsFilterClause } from './metrics-filter-clause';

/** One bounded daily aggregate over the same server-resolved ticket visibility predicate as the KPI explorer. */
export function buildCommandActivityQuery(scope: CommandActivityScope, from: string, to: string) {
  const visibility = buildVisibilityClause(scope.visibility, 5);
  const filters = metricsFilterClause({
    areaId: scope.filters?.areaId,
    ticketType: scope.filters?.ticketType,
    status: scope.filters?.status,
    crewId: scope.filters?.crewId,
    instrumentManId: scope.filters?.instrumentManId,
  }, 5 + visibility.params.length);
  return {
    params: [scope.tenantId, scope.projectId, from, to, ...visibility.params, ...filters.params],
    sql: `WITH authorized AS NOT MATERIALIZED (
      SELECT t.id,t.tenant_id,t.status,t.aor_node_id,t.ticket_type,t.assigned_party_chief_id,
        t.assigned_instrument_man_id,t.first_submitted_at,t.submitted_at,t.completed_at
      FROM tickets t WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.status<>'DRAFT' ${visibility.sql}
    ), narrowed AS MATERIALIZED (
      SELECT t.* FROM authorized t WHERE ${filters.sql}
    ), synthetic AS (
      SELECT DISTINCT e.ticket_id FROM ticket_events e
      JOIN narrowed t ON t.id=e.ticket_id AND t.tenant_id=e.tenant_id
      WHERE e.tenant_id=$1 AND e.payload->>'importSnapshot'='true'
        AND e.payload->>'completionDateGenerated'='true'
    ), event_counts AS (
      SELECT day,SUM(submitted)::int AS submitted,SUM(completed)::int AS completed
      FROM (
        SELECT (COALESCE(t.first_submitted_at,t.submitted_at) AT TIME ZONE 'UTC')::date AS day,
          1 AS submitted,0 AS completed FROM narrowed t
        WHERE COALESCE(t.first_submitted_at,t.submitted_at)>=($3::date::timestamp AT TIME ZONE 'UTC')
          AND COALESCE(t.first_submitted_at,t.submitted_at)<(($4::date+INTERVAL '1 day') AT TIME ZONE 'UTC')
        UNION ALL
        SELECT (t.completed_at AT TIME ZONE 'UTC')::date AS day,0 AS submitted,1 AS completed
        FROM narrowed t LEFT JOIN synthetic s ON s.ticket_id=t.id
        WHERE t.status='COMPLETED' AND s.ticket_id IS NULL
          AND t.completed_at>=($3::date::timestamp AT TIME ZONE 'UTC')
          AND t.completed_at<(($4::date+INTERVAL '1 day') AT TIME ZONE 'UTC')
      ) events GROUP BY day
    ), days AS (
      SELECT d.day::date AS day FROM generate_series($3::date,$4::date,INTERVAL '1 day') AS d(day)
    ) SELECT jsonb_build_object(
      'from',$3::text,'to',$4::text,'timezone','UTC',
      'days',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',d.day,'submitted',COALESCE(e.submitted,0),
        'recordedCompletions',COALESCE(e.completed,0)) ORDER BY d.day)
        FROM days d LEFT JOIN event_counts e ON e.day=d.day),'[]'::jsonb),
      'excludedSyntheticCompletions',(SELECT COUNT(*)::int FROM narrowed t JOIN synthetic s ON s.ticket_id=t.id
        WHERE t.status='COMPLETED' AND t.completed_at>=($3::date::timestamp AT TIME ZONE 'UTC')
          AND t.completed_at<(($4::date+INTERVAL '1 day') AT TIME ZONE 'UTC'))
    ) AS activity`,
  };
}

export class PostgresCommandActivityReader implements CommandActivityReader {
  async read(db: DbClient, scope: CommandActivityScope, from: string, to: string): Promise<CommandActivity> {
    const query = buildCommandActivityQuery(scope, from, to);
    const { rows } = await db.query<{ activity: CommandActivity }>(query.sql, query.params);
    if (!rows[0]) throw new Error('Command activity aggregate returned no result');
    return rows[0].activity;
  }
}
