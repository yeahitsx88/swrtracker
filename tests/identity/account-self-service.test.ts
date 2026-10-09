import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import {
  changeOwnName, changeOwnPassword, normalizeDisplayName, validateNewPassword, verifyCurrentPassword,
} from '@/modules/identity/application/account-self-service';
import type { LoginRateLimiter } from '@/modules/identity/application/login-rate-limit';
import type { AuthContext } from '@/lib/auth';
import type { DbClient, UUID } from '@/shared/types';

const auth: AuthContext = { userId: '10000000-0000-4000-8000-000000000016' as UUID, tenantId: '10000000-0000-4000-8000-000000000001' as UUID, sessionVersion: 3 };

function fakeDb(account: Record<string, unknown> | null) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      if (/SELECT name, email, password_hash/.test(sql)) return { rows: account ? [account] : [], rowCount: account ? 1 : 0 };
      return { rows: [], rowCount: 1 };
    },
  } as unknown as DbClient;
  return { db, queries };
}

function limiter() {
  const calls: string[] = [];
  const value: LoginRateLimiter = {
    async assertCanAttempt() { calls.push('assert'); },
    async recordFailure() { calls.push('failure'); },
    async clearFailures() { calls.push('clear'); },
  };
  return { value, calls };
}

test('display names are trimmed, collapsed and bounded', () => {
  assert.equal(normalizeDisplayName('  Dana   Field  Engineer '), 'Dana Field Engineer');
  for (const bad of ['', '   ', 42, null, 'x'.repeat(121)]) assert.throws(() => normalizeDisplayName(bad), { type: 'ValidationError' });
});

test('new passwords need 8+ characters, at most 72 bytes, and must differ from the current one', () => {
  assert.equal(validateNewPassword('correct horse', 'old password'), 'correct horse');
  assert.throws(() => validateNewPassword('short', 'old password'), { type: 'ValidationError' });
  assert.throws(() => validateNewPassword('é'.repeat(37), 'old password'), { type: 'ValidationError' });
  assert.throws(() => validateNewPassword('same password', 'same password'), { type: 'ValidationError' });
  assert.throws(() => validateNewPassword(undefined, 'old password'), { type: 'ValidationError' });
});

test('name change locks the current session row, updates once and records an administrative event', async () => {
  const { db, queries } = fakeDb({ name: 'Dana', email: 'e@x', password_hash: 'h', auth_method: 'LOCAL', session_version: 3 });
  assert.deepEqual(await changeOwnName(db, auth, ' Dana  Field '), { name: 'Dana Field', changed: true });
  assert.match(queries[0]!.sql, /FOR UPDATE/);
  assert.ok(queries.some(q => /UPDATE users SET name/.test(q.sql)));
  const event = queries.find(q => /INSERT INTO administrative_events/.test(q.sql));
  assert.ok(event);
  assert.equal(event.params[5], 'account.profile_updated');
});

test('unchanged name writes nothing; stale session is refused', async () => {
  const same = fakeDb({ name: 'Dana', email: 'e@x', password_hash: 'h', auth_method: 'LOCAL', session_version: 3 });
  assert.deepEqual(await changeOwnName(same.db, auth, 'Dana'), { name: 'Dana', changed: false });
  assert.equal(same.queries.length, 1);
  const stale = fakeDb({ name: 'Dana', email: 'e@x', password_hash: 'h', auth_method: 'LOCAL', session_version: 4 });
  await assert.rejects(changeOwnName(stale.db, auth, 'New'), { type: 'UnauthorizedError' });
  assert.equal(stale.queries.length, 1);
});

test('wrong current password records a rate-limit failure and changes nothing', async () => {
  const hash = await bcrypt.hash('right password', 4);
  const { db, queries } = fakeDb({ name: 'Dana', email: 'E@X', password_hash: hash, auth_method: 'LOCAL', session_version: 3 });
  const rate = limiter();
  await assert.rejects(verifyCurrentPassword(db, auth, 'wrong password', rate.value), { code: 'AUTH_CURRENT_PASSWORD_INVALID' });
  assert.deepEqual(rate.calls, ['assert', 'failure']);
  assert.ok(!queries.some(q => /UPDATE w+ SET/.test(q.sql)));
});

test('accounts without a local password cannot use self-service change', async () => {
  const { db } = fakeDb({ name: 'Dana', email: 'e@x', password_hash: null, auth_method: 'SSO', session_version: 3 });
  await assert.rejects(verifyCurrentPassword(db, auth, 'anything', limiter().value), { type: 'ValidationError' });
});

test('password change advances the session version, retires reset links and audits without secrets', async () => {
  const hash = await bcrypt.hash('right password', 4);
  const account = { name: 'Dana', email: 'e@x', password_hash: hash, auth_method: 'LOCAL', session_version: 3 };
  const rate = limiter();
  const verified = await verifyCurrentPassword(fakeDb(account).db, auth, 'right password', rate.value);
  assert.deepEqual(rate.calls, ['assert', 'clear']);
  const { db, queries } = fakeDb(account);
  assert.deepEqual(await changeOwnPassword(db, auth, verified, 'brand new passphrase'), { sessionVersion: 4 });
  const update = queries.find(q => /UPDATE users SET password_hash/.test(q.sql));
  assert.ok(update);
  assert.equal(update.params[3], 4);
  assert.ok(await bcrypt.compare('brand new passphrase', String(update.params[2])));
  assert.ok(queries.some(q => /UPDATE password_reset_tokens SET used_at/.test(q.sql)));
  const event = queries.find(q => /INSERT INTO administrative_events/.test(q.sql));
  assert.ok(event);
  assert.equal(event.params[5], 'password.changed');
  assert.ok(!JSON.stringify(event.params).includes('brand new passphrase'));
  assert.ok(!JSON.stringify(event.params).includes(hash));
});

test('a password changed between verification and update is refused', async () => {
  const hash = await bcrypt.hash('right password', 4);
  const verified = { verifiedHash: hash, currentPassword: 'right password' };
  const { db, queries } = fakeDb({ name: 'Dana', email: 'e@x', password_hash: 'a different hash', auth_method: 'LOCAL', session_version: 3 });
  await assert.rejects(changeOwnPassword(db, auth, verified, 'brand new passphrase'), { type: 'UnauthorizedError' });
  assert.ok(!queries.some(q => /UPDATE w+ SET/.test(q.sql)));
});
