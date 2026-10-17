import test from 'node:test';
import assert from 'node:assert/strict';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import type { DbClient, UUID } from '@/shared/types';

test('AOR code lookup scopes by tenant, project, and node ID', async () => {
  let queryText = '';
  let queryValues: unknown[] | undefined;
  const db: DbClient = {
    query: async <T extends object>(sql: string, values?: unknown[]) => {
      queryText = sql;
      queryValues = values;
      return { rows: [{ code: 'U1' } as T] };
    },
  };

  const code = await new TicketRepository().findAorNodeCode(
    db,
    'tenant-1' as UUID,
    'project-1' as UUID,
    'aor-1' as UUID,
  );

  assert.equal(code, 'U1');
  assert.match(queryText, /tenant_id = \$2 AND project_id = \$3/);
  assert.deepEqual(queryValues, ['aor-1', 'tenant-1', 'project-1']);
});
