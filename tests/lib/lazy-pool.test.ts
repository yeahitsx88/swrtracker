import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { createLazyPool } from '@/lib/lazy-pool';

test('lazy pool preserves receiver and state replacement across idle cleanup cycles', () => {
  let resolutions = 0;
  const instance = {
    clients: [1, 2],
    get totalCount() { return this.clients.length; },
    remove() { this.clients = this.clients.slice(1); return this; },
  };
  const proxy = createLazyPool(() => { resolutions++; return instance as unknown as Pool; }) as unknown as typeof instance;
  assert.equal(resolutions, 0, 'creation must not initialize the pool during Next build');
  assert.equal(proxy.totalCount, 2);
  assert.equal(proxy.remove(), instance, 'pg methods must run with the real pool as this');
  assert.equal(instance.totalCount, 1);
  proxy.remove();
  assert.equal(proxy.totalCount, 0);
});

test('lazy pool propagates query errors and supports detached method calls', async () => {
  const failure = new Error('database query failed');
  const instance = { failure, async query() { throw this.failure; } };
  const proxy = createLazyPool(() => instance as unknown as Pool);
  const query = proxy.query;
  await assert.rejects(() => query('SELECT 1'), error => error === failure);
});
