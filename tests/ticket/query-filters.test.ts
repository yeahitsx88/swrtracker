import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTicketListQuery } from '@/lib/ticket-list-query';
import { ticketFilterClause } from '@/modules/ticket/infrastructure/ticket-filter-clause';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { DbClient, UUID } from '@/shared/types';

test('ticket query parser preserves defaults and validates bounded integer pages', () => {
  assert.deepEqual(parseTicketListQuery(new URLSearchParams()), { filters: {}, sort: 'created', limit: 50, offset: 0 });
  for (const query of ['limit=0', 'limit=-1', 'limit=201', 'limit=10abc', 'limit=1.2', 'limit=', 'offset=-1', 'offset=Infinity', 'offset=2147483648', 'limit=10&limit=20']) {
    assert.throws(() => parseTicketListQuery(new URLSearchParams(query)), /Invalid|Duplicate/);
  }
});

test('ticket query parser rejects invalid dimensions and accepts current workflow names', () => {
  for (const query of ['queue=everything', 'status=CLOSED', 'priority=urgent', 'areaId=bad', 'ticketType=OTHER', 'sort=sql', `query=${'a'.repeat(201)}`]) {
    assert.throws(() => parseTicketListQuery(new URLSearchParams(query)));
  }
  const parsed = parseTicketListQuery(new URLSearchParams('queue=open&status=PENDING_FIELD_VALIDATION&priority=HIGH&ticketType=TOPO&query=%20layout%20&sort=operations&limit=10'));
  assert.equal(parsed.filters.status, 'PENDING_FIELD_VALIDATION');
  assert.equal(parsed.filters.query, 'layout');
  assert.equal(parsed.limit, 10);
});

test('ticket query values are bound, including literal search wildcard and SQL characters', () => {
  const hostile = "%_' OR 1=1 --";
  const clause = ticketFilterClause({ query: hostile, areaId: 'area', priority: 'HIGH' }, 5);
  assert.deepEqual(clause.params, ['area', 'HIGH', hostile]);
  assert.match(clause.sql, /t.aor_node_id = \$5/);
  assert.match(clause.sql, /strpos/);
  assert.match(clause.sql, /search_user.tenant_id = t.tenant_id/);
  assert.ok(!clause.sql.includes(hostile));
});

test('queue filters distinguish approved unassigned, completed and overdue populations', () => {
  assert.match(ticketFilterClause({ queue: 'assignment' }, 1).sql, /assigned_instrument_man_id IS NULL/);
  assert.equal(ticketFilterClause({ queue: 'completed' }, 1).sql, "t.status = 'COMPLETED'");
  const overdue = ticketFilterClause({ queue: 'overdue' }, 1);
  assert.match(overdue.sql, /NOT \(t.status = ANY/);
  assert.match(overdue.sql, /AT TIME ZONE 'UTC'/);
  assert.deepEqual(ticketFilterClause({}, 1), { sql: '', params: [] });
});

test('role work queues select actionable statuses at the data layer', () => {
  const parsed = parseTicketListQuery(new URLSearchParams('queue=fieldWork&limit=25&offset=50'));
  assert.equal(parsed.filters.queue, 'fieldWork');
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.offset, 50);
  const clause = ticketFilterClause(parsed.filters, 5);
  assert.equal(clause.sql, 't.status = ANY($5::text[])');
  assert.deepEqual(clause.params, [['ASSIGNED', 'IN_PROGRESS', 'DELAYED']]);
  const approval = parseTicketListQuery(new URLSearchParams('queue=pcApprovals'));
  assert.equal(approval.filters.queue, 'pcApprovals');
  const approvalClause = ticketFilterClause(approval.filters, 5);
  assert.equal(approvalClause.sql, 't.status = ANY($5::text[])');
  assert.deepEqual(approvalClause.params, [['PENDING_FIELD_VALIDATION', 'PENDING_PC_APPROVAL']]);
});

test('KPI detail filters validate dates and retain bounded crew/date predicates', () => {
  for (const query of ['crewId=bad','dateFrom=0000-01-01','dateBasis=bad','dateFrom=2026-02-30','dateFrom=2026-03-01&dateTo=2026-02-01']) {
    assert.throws(()=>parseTicketListQuery(new URLSearchParams(query)),{name:'ValidationError'});
  }
  const filters=parseTicketListQuery(new URLSearchParams('queue=all&dateBasis=completed&dateFrom=2026-01-01&dateTo=2026-01-31&crewId=00000000-0000-4000-8000-000000000001')).filters;
  const query=ticketFilterClause(filters,5);
  assert.match(query.sql,/t.status <> 'DRAFT'/);
  assert.match(query.sql,/t.assigned_party_chief_id = \$5/);
  assert.match(query.sql,/AT TIME ZONE 'UTC'/);
  assert.deepEqual(query.params,['00000000-0000-4000-8000-000000000001','2026-01-01','2026-01-31']);
});

test('filtered list count and page share authorization and narrowing with stable bounded order', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db: DbClient = { query: async <T extends object>(sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    return { rows: (/COUNT\(\*\)/.test(sql) ? [{ total: '0' }] : []) as T[] };
  } };
  await new TicketRepository().list(db, 'tenant' as UUID, {
    projectId: 'project' as UUID,
    visibility: { actorId: 'actor' as UUID, actorRole: 'REQUESTER', companyId: 'company' as UUID, companyType: 'SUBCONTRACTOR' },
    filters: { areaId: 'outside-area', queue: 'assignment', query: 'layout' }, sort: 'operations', limit: 10, offset: 20,
  });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(call.sql, /t.tenant_id = \$1 AND t.project_id = \$2 AND t.requester_id = \$3 AND t.company_id = \$4/);
    assert.match(call.sql, /AND t.aor_node_id = \$5/);
    assert.deepEqual(call.values.slice(0, 6), ['tenant', 'project', 'actor', 'company', 'outside-area', 'layout']);
  }
  assert.match(calls[1]!.sql, /t.id ASC/);
  assert.match(calls[1]!.sql, /LIMIT \$7 OFFSET \$8/);
  assert.deepEqual(calls[1]!.values.slice(-2), [10, 20]);

  calls.length = 0;
  await new TicketRepository().list(db, 'tenant' as UUID, {
    projectId: 'project' as UUID,
    visibility: { actorId: 'actor' as UUID, actorRole: 'REQUESTER', companyId: 'company' as UUID, companyType: 'SUBCONTRACTOR' },
    filters: { queue: 'fieldWork' }, sort: 'operations', limit: 25, offset: 50,
  });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(call.sql, /t.tenant_id = \$1 AND t.project_id = \$2 AND t.requester_id = \$3 AND t.company_id = \$4/);
    assert.match(call.sql, /t.status = ANY\(\$5::text\[\]\)/);
    assert.deepEqual(call.values[4], ['ASSIGNED', 'IN_PROGRESS', 'DELAYED']);
  }
  assert.deepEqual(calls[1]!.values.slice(-2), [25, 50]);
});
