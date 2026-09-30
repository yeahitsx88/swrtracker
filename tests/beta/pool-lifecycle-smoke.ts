// Read-only opt-in integration check. Run against an isolated/local database.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { createLazyPool } from '../../src/lib/lazy-pool';

async function main() {
  assert.equal(process.env.SWR_POOL_SMOKE, '1', 'Set SWR_POOL_SMOKE=1 for an explicitly selected local test database');
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
  const raw = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, idleTimeoutMillis: 40, connectionTimeoutMillis: 2000, query_timeout: 2000 });
  const proxy = createLazyPool(() => raw);
  try {
    for (let cycle = 0; cycle < 12; cycle++) {
      const result = await proxy.query<{ value: number }>('SELECT 1::int AS value');
      assert.equal(result.rows[0]?.value, 1);
      const deadline = Date.now() + 2000;
      while (raw.totalCount > 0 && Date.now() < deadline) await delay(20);
      assert.equal(raw.totalCount, 0, `idle cycle ${cycle + 1} must remove the expired client`);
      assert.equal(raw.waitingCount, 0);
    }
    console.log('Pool lifecycle passed: 12 read-only query/idle-expiry cycles, no leaked clients or queued waiters.');
  } finally {
    await raw.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Pool lifecycle failed'); process.exitCode = 1; });
