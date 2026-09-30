import test from 'node:test';
import assert from 'node:assert/strict';
import { getAmeliaMetrics, type AmeliaMetrics, type MetricsScope } from '@/modules/reporting/application/amelia-metrics';
import { AmeliaMetricsReader, buildMetricsQuery } from '@/modules/reporting/infrastructure/amelia-metrics.reader';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { parseMetricsQuery } from '@/lib/metrics-query';

const id = (value: string) => value as UUID;
const base: MetricsScope = { tenantId: id('tenant'), projectId: id('project'), today: '2026-09-29',
  visibility: { actorId: id('actor'), actorRole: 'SURVEY_MANAGER', projectId: id('project'), companyId: id('company'), companyType: 'GC' } };
const empty: AmeliaMetrics = { openTotal: 0, openByAreaStatus: [], approvedWithoutInstrumentMan: 0,
  overdueNeedBy: 0, completedTotal: 0, averageSubmissionToCompletionHours: null };
function database(check: (sql: string, params: unknown[]) => void, result = empty): DbClient {
  return { async query<T extends object>(sql: string, params: unknown[] = []) {
    check(sql, params); return { rows: [{ metrics: result }] as T[] };
  } };
}

test('metrics produce one scoped snapshot with no draft counts', async () => {
  let calls = 0;
  const expected = { ...empty, openTotal: 7, completedTotal: 5, averageSubmissionToCompletionHours: 36.5 };
  const db = database((sql, params) => {
    calls++;
    assert.ok(sql.includes("t.tenant_id = $1 AND t.project_id = $2 AND t.status <> 'DRAFT'"));
    assert.ok(sql.includes('FROM authorized'));
    assert.deepEqual(params.slice(0, 2), ['tenant', 'project']);
  }, expected);
  assert.deepEqual(await getAmeliaMetrics(new AmeliaMetricsReader(), db, base), expected);
  assert.equal(calls, 1);
});
test('metrics deny configuration-only role and mismatched project before querying', async () => {
  const db = database(() => { throw new Error('must not query'); });
  for (const visibility of [{ ...base.visibility, actorRole: 'PROJECT_ADMIN' as const }, { ...base.visibility, projectId: id('other') }]) {
    await assert.rejects(getAmeliaMetrics(new AmeliaMetricsReader(), db, { ...base, visibility }), { name: 'ForbiddenError' });
  }
});
test('metrics retain requester, crew, Area and department visibility', async () => {
  const cases: Array<[ProjectRole, string, unknown[]]> = [
    ['REQUESTER', 't.requester_id = $5', ['actor']],
    ['PARTY_CHIEF', 't.assigned_party_chief_id = $5', ['actor']],
    ['INSTRUMENT_MAN', 't.assigned_party_chief_id = $5 OR t.assigned_instrument_man_id = $6', ['chief', 'actor']],
    ['SURVEY_SUPERINTENDENT', 't.aor_node_id IN ($5, $6)', ['area', 'child']],
    ['AREA_VIEWER', 't.aor_node_id IN ($5, $6)', ['area', 'child']],
    ['DEPARTMENT_MANAGER', 't.department_id = $5', ['department']],
    ['DEPARTMENT_LEAD', 't.department_id = $5 AND t.aor_node_id IN ($6, $7)', ['department', 'area', 'child']],
  ];
  for (const [actorRole, clause, values] of cases) {
    const db = database((sql, params) => { assert.ok(sql.includes(clause)); assert.deepEqual(params.slice(4), values); });
    await getAmeliaMetrics(new AmeliaMetricsReader(), db, { ...base, visibility: { ...base.visibility, actorRole,
      partyChiefId: id('chief'), departmentId: id('department'), aorNodeIds: [id('area'), id('child')] } });
  }
});
test('metrics retain company intersection and missing Area fails closed', async () => {
  for (const actorRole of ['SURVEY_MANAGER', 'PARTY_CHIEF', 'SURVEY_SUPERINTENDENT'] as const) {
    const db = database((sql, params) => {
      assert.ok(sql.includes('AND t.company_id = $'));
      assert.equal(params.at(-1), 'company');
      if (actorRole === 'SURVEY_SUPERINTENDENT') assert.ok(sql.includes('AND 1 = 0'));
    });
    await getAmeliaMetrics(new AmeliaMetricsReader(), db, { ...base, visibility: { ...base.visibility, actorRole, companyType: 'SUBCONTRACTOR' } });
  }
});
test('metrics preserve existing subcontractor requester authority grants', async () => {
  const db = database((sql, params) => {
    assert.ok(sql.includes('g.tenant_id = t.tenant_id AND g.project_id = t.project_id'));
    assert.ok(sql.includes("g.revoked_at IS NULL AND pm.role = 'REQUESTER'"));
    assert.deepEqual(params.slice(4), ['actor', 'company', 'project']);
  });
  await getAmeliaMetrics(new AmeliaMetricsReader(), db, { ...base, visibility: { ...base.visibility, actorRole: 'REQUESTER', companyType: 'SUBCONTRACTOR' } });
});

test('analytics query rejects malformed, duplicate, unknown and draft filters', () => {
  for (const query of ['actorRole=SURVEY_MANAGER', 'crewId=wrong', 'instrumentManId=wrong', 'population=sql', 'status=DRAFT',
    'dateFrom=0000-01-01', 'dateFrom=2024-02-30', 'dateFrom=2024-03-01&dateTo=2024-02-29', 'dateBasis=invalid', 'status=COMPLETED&status=SUBMITTED']) {
    assert.throws(() => parseMetricsQuery(new URLSearchParams(query)), { name: 'ValidationError' });
  }
  const filters = parseMetricsQuery(new URLSearchParams('population=completed&dateFrom=2024-02-29&dateTo=2024-02-29&dateBasis=completed&ticketType=TOPO'));
  assert.equal(filters.dateTo, '2024-02-29'); assert.equal(filters.ticketType, 'TOPO');
});
test('analytics rejects personnel filters before querying without explicit crew authority', async () => {
  const db = database(() => { throw new Error('must not query'); });
  for (const actorRole of ['REQUESTER', 'INSTRUMENT_MAN', 'SURVEY_SUPERINTENDENT', 'VIEWER', 'AREA_VIEWER', 'CAD_LEAD', 'DEPARTMENT_MANAGER'] as const) {
    for (const filters of [{ crewId: 'chief' }, { instrumentManId: 'im' }]) {
      await assert.rejects(getAmeliaMetrics(new AmeliaMetricsReader(), db, { ...base, filters, visibility: { ...base.visibility, actorRole } }), { name: 'ForbiddenError' });
    }
  }
});
test('analytics binds filters after scope and uses the same filtered population for all measures', async () => {
  const db = database((sql, params) => {
    assert.ok(sql.includes('t.assigned_party_chief_id = $5'));
    assert.ok(sql.includes('FROM authorized t WHERE t.aor_node_id = $6 AND t.assigned_party_chief_id = $7'));
    assert.ok(sql.includes("AT TIME ZONE 'UTC'"));
    assert.ok(sql.includes("INTERVAL '1 day'"));
    assert.ok(sql.includes('FROM filtered t LEFT JOIN provenance'));
    assert.ok(sql.includes('FROM measured'));
    assert.deepEqual(params.slice(4), ['actor', 'area', 'other-chief', '2024-02-29', '2024-02-29', 'area', 'other-chief', '2024-02-29', '2024-02-29']);
  });
  await getAmeliaMetrics(new AmeliaMetricsReader(), db, { ...base,
    visibility: { ...base.visibility, actorRole: 'PARTY_CHIEF' },
    filters: { areaId: 'area', crewId: 'other-chief', dateBasis: 'completed', dateFrom: '2024-02-29', dateTo: '2024-02-29' },
  });
});

test('chart SQL is opt-in and personnel series are omitted server-side for readers', () => {
  const minimal = buildMetricsQuery(base).sql;
  assert.ok(!minimal.includes('month_counts AS'));
  const charts = buildMetricsQuery({ ...base, includeCharts: true, visibility: { ...base.visibility, actorRole: 'REQUESTER' } }).sql;
  assert.ok(charts.includes("'crews', '[]'::jsonb"));
  assert.ok(charts.includes("'instrumentMen', '[]'::jsonb"));
  assert.ok(!charts.includes('LEFT JOIN users'));
  assert.ok(charts.includes('generate_series'));
  assert.ok(charts.includes('LIMIT 200'));
  assert.ok(charts.includes("INTERVAL '119 months'"));
  assert.ok(charts.includes("completionDateGenerated"));
  const superintendent = buildMetricsQuery({ ...base, includeCharts: true, visibility: { ...base.visibility,
    actorRole: 'SURVEY_SUPERINTENDENT', aorNodeIds: [id('area')] } }).sql;
  assert.ok(superintendent.includes('t.aor_node_id IN ($5)'));
  assert.ok(superintendent.includes("'crews', '[]'::jsonb"));
  assert.ok(superintendent.includes("'instrumentMen', '[]'::jsonb"));
  assert.ok(!superintendent.includes('LEFT JOIN users'));
});
