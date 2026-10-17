import test from 'node:test';
import assert from 'node:assert/strict';
import { readDirectAssignmentOptions } from '@/modules/ticket/application/direct-assignment-options';
import type { DbClient, UUID } from '@/shared/types';

const scope = { tenantId: '10000000-0000-4000-8000-000000000001' as UUID, projectId: '10000000-0000-4000-8000-000000000002' as UUID };

function fakeDb() {
  const queries: string[] = [];
  const db = {
    async query(sql: string) {
      queries.push(sql);
      if (/FROM project_memberships/.test(sql)) return { rows: [
        { id: 'r1', name: 'Dana', email: 'd@x', role: 'REQUESTER', departmentId: null },
        { id: 'r2', name: 'Sam', email: 's@x', role: 'REQUESTER', departmentId: 'dep1' },
        { id: 'pc', name: 'Pat', email: 'p@x', role: 'PARTY_CHIEF', departmentId: null },
        { id: 'im', name: 'Ira', email: 'i@x', role: 'INSTRUMENT_MAN', departmentId: null },
      ] };
      return { rows: [{ id: 'dep1', name: 'QA/QC' }] };
    },
  } as unknown as DbClient;
  return { db, queries };
}

test('only the Survey Manager and Superintendents can load direct-assignment choices', async () => {
  for (const actorRole of ['REQUESTER', 'PARTY_CHIEF', 'INSTRUMENT_MAN', 'VIEWER', 'PROJECT_ADMIN'] as const) {
    const { db, queries } = fakeDb();
    await assert.rejects(readDirectAssignmentOptions(db, { ...scope, actorRole }), { type: 'ForbiddenError' });
    assert.equal(queries.length, 0, actorRole);
  }
});

test('choices are grouped by role, keep department membership and exclude disabled access', async () => {
  const { db, queries } = fakeDb();
  const options = await readDirectAssignmentOptions(db, { ...scope, actorRole: 'SURVEY_SUPERINTENDENT' });
  assert.deepEqual(options.requesters.map(r => [r.id, r.departmentId]), [['r1', null], ['r2', 'dep1']]);
  assert.deepEqual(options.partyChiefs.map(p => p.id), ['pc']);
  assert.deepEqual(options.instrumentMen.map(p => p.id), ['im']);
  assert.deepEqual(options.departments, [{ id: 'dep1', name: 'QA/QC' }]);
  assert.match(queries[0]!, /access_disabled_at IS NULL AND u\.deactivated_at IS NULL/);
  assert.match(queries[0]!, /c\.type <> 'SUBCONTRACTOR' OR pm\.role = 'REQUESTER'/);
});
