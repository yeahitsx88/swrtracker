import type { MetricsFilters } from '../application/metrics-filters';

/** Narrow an already-authorized CTE; column names are never user inputs. */
export function metricsFilterClause(filters: MetricsFilters, start: number) {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown) => { params.push(value); return `$${start + params.length - 1}`; };
  for (const [key, column] of [['areaId', 'aor_node_id'], ['ticketType', 'ticket_type'], ['status', 'status'], ['crewId', 'assigned_party_chief_id'], ['instrumentManId', 'assigned_instrument_man_id']] as const) {
    if (filters[key]) clauses.push(`t.${column} = ${bind(filters[key])}`);
  }
  if (filters.population === 'open' || filters.population === 'overdue') clauses.push('NOT (t.status = ANY($3::text[]))');
  if (filters.population === 'overdue') clauses.push('t.requested_date < $4::date');
  if (filters.population === 'completed') clauses.push("t.status = 'COMPLETED'");
  if (filters.population === 'assignment') clauses.push("t.status = 'APPROVED' AND t.assigned_instrument_man_id IS NULL");
  const date = filters.dateBasis === 'completed' ? 't.completed_at' : filters.dateBasis === 'submitted' ? 'COALESCE(t.first_submitted_at, t.submitted_at)' : 't.requested_date';
  const calendar = filters.dateBasis === 'completed' || filters.dateBasis === 'submitted' ? `(${date} AT TIME ZONE 'UTC')` : date;
  if (filters.dateFrom) clauses.push(`${calendar} >= ${bind(filters.dateFrom)}::date`);
  if (filters.dateTo) clauses.push(`${calendar} < (${bind(filters.dateTo)}::date + INTERVAL '1 day')`);
  return { sql: clauses.join(' AND ') || 'TRUE', params };
}
