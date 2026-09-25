import assert from 'node:assert/strict';
import test from 'node:test';
import type { DbClient, UUID } from '@/shared/types';
import { getProjectWorkflowRole } from '@/lib/get-project-workflow-role';

const id = (tail: string) => `00000000-0000-0000-0000-${tail}` as UUID;

test('acting authority is resolved only through a scoped active grant query', async () => {
  const sql: string[] = [];
  const db = { async query(statement: string) {
    sql.push(statement);
    return { rows: sql.length === 1 ? [{ role: 'PARTY_CHIEF' }]
      : [{ eligible: true }] };
  } } as unknown as DbClient;
  const role = await getProjectWorkflowRole(db, id('000000000001'),
    id('000000000002'), id('000000000003'));
  assert.equal(role, 'SURVEY_MANAGER');
  assert.match(sql[1] ?? '', /ag\.project_id=\$2/);
  assert.match(sql[1] ?? '', /ag\.scope->'actions' \? 'manage_workflow'/);
  assert.match(sql[1] ?? '', /ag\.scope->>'projectId'=ag\.project_id::text/);
  assert.match(sql[1] ?? '', /pm\.role IN \('SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'\)/);
  assert.match(sql[1] ?? '', /ag\.revoked_at IS NULL/);
  assert.match(sql[1] ?? '', /u\.deactivated_at IS NULL/);
});

test('without active grant the real project role remains in force', async () => {
  let calls = 0;
  const db = { async query() {
    calls++;
    return { rows: calls === 1 ? [{ role: 'INSTRUMENT_MAN' }]
      : [{ eligible: false }] };
  } } as unknown as DbClient;
  assert.equal(await getProjectWorkflowRole(db, id('000000000001'),
    id('000000000002'), id('000000000003')), 'INSTRUMENT_MAN');
});
