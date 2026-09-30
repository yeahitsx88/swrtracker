import type { TicketQueryFilters } from '../application/query-filters';

/** Parameterized narrowing only; caller must establish tenant/project/visibility first. */
export function ticketFilterClause(filters: TicketQueryFilters, start: number) {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const parameter = (value: unknown) => { params.push(value); return `$${start + params.length - 1}`; };
  if (filters.queue === 'all' || filters.queue === 'open' || filters.queue === 'overdue') clauses.push("t.status <> 'DRAFT'");
  for (const [key, column] of [['crewId','assigned_party_chief_id'],['instrumentManId','assigned_instrument_man_id']] as const) {
    if (filters[key]) clauses.push(`t.${column} = ${parameter(filters[key])}`);
  }
  const date = filters.dateBasis === 'completed' ? "(t.completed_at AT TIME ZONE 'UTC')" : filters.dateBasis === 'submitted' ? "(COALESCE(t.first_submitted_at,t.submitted_at) AT TIME ZONE 'UTC')" : 't.requested_date';
  if (filters.dateFrom) clauses.push(`${date} >= ${parameter(filters.dateFrom)}::date`);
  if (filters.dateTo) clauses.push(`${date} < (${parameter(filters.dateTo)}::date + INTERVAL '1 day')`);
  if (filters.queue === 'open' || filters.queue === 'overdue') {
    clauses.push(`NOT (t.status = ANY(${parameter(['COMPLETED', 'REJECTED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED'])}::text[]))`);
  }
  if (filters.queue === 'overdue') clauses.push("t.requested_date < (NOW() AT TIME ZONE 'UTC')::date");
  if (filters.queue === 'assignment') clauses.push("t.status = 'APPROVED' AND t.assigned_instrument_man_id IS NULL");
  if (filters.queue === 'completed') clauses.push("t.status = 'COMPLETED'");
  if (filters.queue === 'fieldWork') clauses.push(`t.status = ANY(${parameter(['ASSIGNED', 'IN_PROGRESS', 'DELAYED'])}::text[])`);
  if (filters.queue === 'pcApprovals') clauses.push(`t.status = ANY(${parameter(['PENDING_FIELD_VALIDATION', 'PENDING_PC_APPROVAL'])}::text[])`);
  for (const [key, column] of [['areaId', 'aor_node_id'], ['status', 'status'], ['priority', 'priority'], ['ticketType', 'ticket_type']] as const) {
    if (filters[key]) clauses.push(`t.${column} = ${parameter(filters[key])}`);
  }
  if (filters.query) {
    const term = parameter(filters.query);
    clauses.push(`(strpos(lower(concat_ws(' ', t.ticket_number, t.description, t.field_contact)), lower(${term})) > 0
      OR EXISTS (SELECT 1 FROM users search_user WHERE search_user.tenant_id = t.tenant_id
        AND search_user.id = t.requester_id AND strpos(lower(search_user.name), lower(${term})) > 0))`);
  }
  return { sql: clauses.join(' AND '), params };
}
