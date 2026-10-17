import test from 'node:test';
import assert from 'node:assert/strict';
import type { DbClient, UUID } from '@/shared/types';
import { getCommandActivity, type CommandActivity, type CommandActivityScope } from '@/modules/reporting/application/command-activity';
import { PostgresCommandActivityReader, buildCommandActivityQuery } from '@/modules/reporting/infrastructure/command-activity.reader';

const id = (value: string) => value as UUID;
const base: CommandActivityScope = {
  tenantId: id('tenant'), projectId: id('project'), today: '2026-09-30',
  visibility: { actorId: id('manager'), actorRole: 'SURVEY_MANAGER', projectId: id('project'), companyId: id('company'), companyType: 'GC' },
};
const activity: CommandActivity = { from: '2026-09-01', to: '2026-09-30', timezone: 'UTC',
  days: [{ date: '2026-09-30', submitted: 2, recordedCompletions: 1 }], excludedSyntheticCompletions: 3 };
const db = (check: (sql: string, params: unknown[]) => void): DbClient => ({
  async query<T extends object>(sql: string, params: unknown[] = []) {
    check(sql, params);
    return { rows: [{ activity }] as T[] };
  },
});

test('command activity defaults to 30 UTC days and queries aggregate rows only', async () => {
  let calls = 0;
  const result = await getCommandActivity(new PostgresCommandActivityReader(), db((sql, params) => {
    calls++;
    assert.deepEqual(params, ['tenant', 'project', '2026-09-01', '2026-09-30', 'manager']);
    assert.ok(sql.includes("t.tenant_id=$1 AND t.project_id=$2 AND t.status<>'DRAFT'"));
    assert.ok(sql.includes('FROM authorized t WHERE TRUE'));
    assert.ok(sql.includes("AT TIME ZONE 'UTC'"));
    assert.ok(sql.includes("completionDateGenerated'='true'"));
    assert.ok(sql.includes('generate_series($3::date,$4::date'));
    assert.ok(!sql.includes('SELECT t.* FROM tickets'));
  }), base);
  assert.equal(calls, 1);
  assert.deepEqual(result, activity);
});

test('command activity fails closed for non-manager and mismatched project before querying', async () => {
  const never = db(() => { throw new Error('must not query'); });
  for (const actorRole of ['SURVEY_SUPERINTENDENT', 'PARTY_CHIEF', 'INSTRUMENT_MAN', 'VIEWER', 'PROJECT_ADMIN'] as const) {
    await assert.rejects(getCommandActivity(new PostgresCommandActivityReader(), never, {
      ...base, visibility: { ...base.visibility, actorRole },
    }), { name: 'ForbiddenError' });
  }
  await assert.rejects(getCommandActivity(new PostgresCommandActivityReader(), never, {
    ...base, visibility: { ...base.visibility, projectId: id('other') },
  }), { name: 'ForbiddenError' });
});

test('command activity validates a bounded event-date window', async () => {
  const never = db(() => { throw new Error('must not query'); });
  for (const filters of [
    { dateFrom: '2026-10-01' }, { dateFrom: '2026-01-01' },
    { population: 'completed' as const }, { dateBasis: 'completed' as const },
  ]) {
    await assert.rejects(getCommandActivity(new PostgresCommandActivityReader(), never, { ...base, filters }), { name: 'ValidationError' });
  }
  const query = buildCommandActivityQuery({ ...base, filters: { dateFrom: '2026-09-29', dateTo: '2026-09-30' } }, '2026-09-29', '2026-09-30');
  assert.deepEqual(query.params.slice(0, 4), ['tenant', 'project', '2026-09-29', '2026-09-30']);
});

test('command filters narrow the authorized dataset with bound values', () => {
  const query = buildCommandActivityQuery({ ...base, filters: {
    areaId: 'area-unsafe-quote', ticketType: 'TOPO', crewId: 'chief-unsafe-quote', status: 'COMPLETED',
  } }, '2026-09-01', '2026-09-30');
  assert.ok(query.sql.indexOf('WITH authorized') < query.sql.indexOf('narrowed AS MATERIALIZED'));
  assert.ok(query.sql.includes('FROM authorized t WHERE t.aor_node_id = $6 AND t.ticket_type = $7 AND t.status = $8 AND t.assigned_party_chief_id = $9'));
  assert.deepEqual(query.params.slice(4), ['manager', 'area-unsafe-quote', 'TOPO', 'COMPLETED', 'chief-unsafe-quote']);
  assert.ok(!query.sql.includes('unsafe-quote'));
});
