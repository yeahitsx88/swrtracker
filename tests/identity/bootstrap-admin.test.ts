import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

test('bootstrap preserves a leading password space when applying the length rule', () => {
  const password = ' abcdefg';
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', resolve('db/bootstrap-admin.ts')],
    {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/invalid',
        BOOTSTRAP_TENANT_NAME: 'Bootstrap Test',
        BOOTSTRAP_COMPANY_NAME: 'Bootstrap Test GC',
        BOOTSTRAP_ADMIN_NAME: 'Bootstrap Test Admin',
        BOOTSTRAP_ADMIN_EMAIL: 'bootstrap@example.test',
        BOOTSTRAP_ADMIN_PASSWORD: password,
      },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ECONNREFUSED/);
  assert.doesNotMatch(result.stderr, /failed validation/);
  assert.doesNotMatch(result.stderr, new RegExp(password));
  assert.doesNotMatch(result.stdout, new RegExp(password));
});
