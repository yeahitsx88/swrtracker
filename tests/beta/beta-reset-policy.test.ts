import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { assertSafeBetaResetRoot, betaBackupPath } from '../../scripts/beta-reset-policy';

test('beta reset accepts only the fixed workspace beta directory', () => {
  const cwd = path.resolve('/workspace/swrtracker');
  assert.doesNotThrow(() => assertSafeBetaResetRoot(cwd, path.join(cwd, '.data', 'beta')));
  assert.throws(
    () => assertSafeBetaResetRoot(cwd, path.join(cwd, '.data')),
    /Refusing to reset an unexpected beta path/,
  );
  assert.throws(
    () => assertSafeBetaResetRoot(cwd, path.resolve('/workspace/other/beta')),
    /Refusing to reset an unexpected beta path/,
  );
});

test('beta reset backup path is timestamped under the workspace backup directory', () => {
  const cwd = path.resolve('/workspace/swrtracker');
  assert.equal(
    betaBackupPath(cwd, new Date('2026-09-24T12:34:56.789Z')),
    path.join(cwd, '.data', 'beta-backups', '2026-09-24T12-34-56-789Z'),
  );
});
