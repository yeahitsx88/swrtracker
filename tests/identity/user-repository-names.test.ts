import assert from 'node:assert/strict';
import test from 'node:test';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import type { DbClient, UUID } from '@/shared/types';

const id = (value: string) => value as UUID;

test('findNamesByIds is tenant scoped, deduplicates IDs, and returns names only', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const db: DbClient = {
    query: async <T extends object>(sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [
        { id: 'requester-1', name: 'Requester One' },
        { id: 'requester-2', name: 'Requester Two' },
      ] as unknown as T[] };
    },
  };

  const names = await new UserRepository().findNamesByIds(
    db,
    id('tenant-1'),
    [id('requester-1'), id('requester-1'), id('requester-2')],
  );

  assert.match(queries[0]?.sql ?? '', /tenant_id = \$1/);
  assert.match(queries[0]?.sql ?? '', /id = ANY\(\$2::uuid\[\]\)/);
  assert.deepEqual(queries[0]?.params, ['tenant-1', ['requester-1', 'requester-2']]);
  assert.deepEqual([...names.entries()], [
    ['requester-1', 'Requester One'],
    ['requester-2', 'Requester Two'],
  ]);
});

test('findNamesByIds avoids a database query for an empty page', async () => {
  let queried = false;
  const db: DbClient = {
    query: async <T extends object>() => {
      queried = true;
      return { rows: [] as T[] };
    },
  };

  const names = await new UserRepository().findNamesByIds(db, id('tenant-1'), []);
  assert.equal(queried, false);
  assert.equal(names.size, 0);
});
