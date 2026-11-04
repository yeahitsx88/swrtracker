import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { RateLimitError, UnauthorizedError } from '@/shared/errors';
import jwt from 'jsonwebtoken';
import {
  MAX_EMAIL_SIGN_IN_ACCOUNTS,
  signInByEmail,
} from '@/modules/identity/application/authenticate';
import type { LoginRateLimiter, LoginRateLimitScope } from '@/modules/identity/application/login-rate-limit';
import type { EmailAccount, IEmailAccountLookup } from '@/modules/identity/application/ports';
import type { DbClient, UUID } from '@/shared/types';

const db: DbClient = { query: async () => ({ rows: [] }) };
const email = 'field.user@example.com';
const tenantA = '10000000-0000-4000-8000-00000000000a' as UUID;
const tenantB = '10000000-0000-4000-8000-00000000000b' as UUID;
const passwordA = 'password-for-a';
const passwordB = 'password-for-b';
// Low cost keeps the suite fast; production hashes use cost 12.
const hashA = bcrypt.hashSync(passwordA, 4);
const hashB = bcrypt.hashSync(passwordB, 4);

function account(tenantId: UUID, tenantName: string, overrides?: Partial<EmailAccount>): EmailAccount {
  return {
    id: `user-${tenantName}` as UUID,
    tenantId,
    tenantName,
    companyId: `company-${tenantName}` as UUID,
    email,
    name: 'Field User',
    authMethod: 'LOCAL',
    sessionVersion: 3,
    deactivatedAt: null,
    passwordHash: hashA,
    createdAt: new Date('2026-11-04T12:00:00Z'),
    ...overrides,
  };
}

function lookupOf(accounts: EmailAccount[], seen?: { email?: string; limit?: number }): IEmailAccountLookup {
  return {
    findLocalAccountsByEmail: async (_db, requestedEmail, limit) => {
      if (seen) { seen.email = requestedEmail; seen.limit = limit; }
      return accounts;
    },
  };
}

interface LimiterLog {
  asserted: LoginRateLimitScope[];
  recorded: LoginRateLimitScope[];
  cleared: LoginRateLimitScope[];
}

function limiter(options?: { blockedTenants?: UUID[]; lockOnRecordTenants?: UUID[] }): LoginRateLimiter & { log: LimiterLog } {
  const log: LimiterLog = { asserted: [], recorded: [], cleared: [] };
  return {
    log,
    assertCanAttempt: async (_db, scope) => {
      log.asserted.push(scope);
      if (options?.blockedTenants?.includes(scope.tenantId)) {
        throw new RateLimitError('Too many login attempts. Try again later.', 'AUTH_RATE_LIMITED');
      }
    },
    recordFailure: async (_db, scope) => {
      log.recorded.push(scope);
      if (options?.lockOnRecordTenants?.includes(scope.tenantId)) {
        throw new RateLimitError('Too many login attempts. Try again later.', 'AUTH_RATE_LIMITED');
      }
    },
    clearFailures: async (_db, scope) => { log.cleared.push(scope); },
  };
}

async function withSecret<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'email-sign-in-test-secret';
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
}

test('email sign-in: unknown email gives the wrong-password message and creates no lockout bookkeeping', async () => {
  const rate = limiter();
  await assert.rejects(
    () => signInByEmail(lookupOf([]), rate, db, { email, password: passwordA }),
    (err: unknown) => err instanceof UnauthorizedError && err.message === 'Invalid email or password',
  );
  assert.deepEqual(rate.log, { asserted: [], recorded: [], cleared: [] });
});

test('email sign-in: one matching account signs in to its own tenant and clears only that lockout', async () => {
  const seen: { email?: string; limit?: number } = {};
  const rate = limiter();
  const result = await withSecret(() =>
    signInByEmail(lookupOf([account(tenantA, 'Alpha')], seen), rate, db, { email, password: passwordA }));

  assert.equal(result.kind, 'signed-in');
  if (result.kind !== 'signed-in') return;
  assert.equal(result.user.tenantId, tenantA);
  assert.equal('passwordHash' in result.user, false);
  assert.equal('tenantName' in result.user, false);
  const claims = jwt.decode(result.token) as { sub: string; tenantId: string; sv: number };
  assert.equal(claims.sub, 'user-Alpha');
  assert.equal(claims.tenantId, tenantA);
  assert.equal(claims.sv, 3);
  assert.deepEqual(rate.log.cleared, [{ tenantId: tenantA, email }]);
  assert.deepEqual(rate.log.recorded, []);
  assert.equal(seen.email, email);
  assert.equal(seen.limit, MAX_EMAIL_SIGN_IN_ACCOUNTS);
});

test('email sign-in: the same password in two organizations returns a choice of only those, with no session', async () => {
  const rate = limiter();
  const result = await signInByEmail(
    lookupOf([account(tenantA, 'Alpha'), account(tenantB, 'Bravo')]),
    rate, db, { email, password: passwordA },
  );
  assert.deepEqual(result, {
    kind: 'choose-organization',
    organizations: [{ tenantId: tenantA, name: 'Alpha' }, { tenantId: tenantB, name: 'Bravo' }],
  });
  assert.deepEqual(rate.log.cleared, []);
  assert.deepEqual(rate.log.recorded, []);
});

test('email sign-in: a password that matches one of two organizations signs in there without naming the other', async () => {
  const rate = limiter();
  const result = await withSecret(() => signInByEmail(
    lookupOf([account(tenantA, 'Alpha'), account(tenantB, 'Bravo', { passwordHash: hashB })]),
    rate, db, { email, password: passwordB },
  ));
  assert.equal(result.kind, 'signed-in');
  if (result.kind !== 'signed-in') return;
  assert.equal(result.user.tenantId, tenantB);
  assert.deepEqual(rate.log.cleared, [{ tenantId: tenantB, email }]);
});

test('email sign-in: a wrong password counts against every candidate account', async () => {
  const rate = limiter();
  await assert.rejects(
    () => signInByEmail(
      lookupOf([account(tenantA, 'Alpha'), account(tenantB, 'Bravo', { passwordHash: hashB })]),
      rate, db, { email, password: 'wrong-password' },
    ),
    (err: unknown) => err instanceof UnauthorizedError && err.message === 'Invalid email or password',
  );
  assert.deepEqual(rate.log.recorded, [{ tenantId: tenantA, email }, { tenantId: tenantB, email }]);
  assert.deepEqual(rate.log.cleared, []);
});

test('email sign-in: a lockout starting on one candidate still records the failure on the others', async () => {
  const rate = limiter({ lockOnRecordTenants: [tenantA] });
  await assert.rejects(
    () => signInByEmail(
      lookupOf([account(tenantA, 'Alpha'), account(tenantB, 'Bravo')]),
      rate, db, { email, password: 'wrong-password' },
    ),
    (err: unknown) => err instanceof RateLimitError && err.code === 'AUTH_RATE_LIMITED',
  );
  assert.deepEqual(rate.log.recorded, [{ tenantId: tenantA, email }, { tenantId: tenantB, email }]);
});

test('email sign-in: an active lockout on any candidate refuses the attempt before any failure is recorded', async () => {
  const rate = limiter({ blockedTenants: [tenantB] });
  await assert.rejects(
    () => signInByEmail(
      lookupOf([account(tenantA, 'Alpha'), account(tenantB, 'Bravo')]),
      rate, db, { email, password: passwordA },
    ),
    (err: unknown) => err instanceof RateLimitError,
  );
  assert.deepEqual(rate.log.recorded, []);
  assert.deepEqual(rate.log.cleared, []);
});

test('email sign-in: a correct password on a disabled account keeps the disabled message and counts as a failure', async () => {
  const rate = limiter();
  await assert.rejects(
    () => signInByEmail(
      lookupOf([account(tenantA, 'Alpha', { deactivatedAt: new Date('2026-11-01T00:00:00Z') })]),
      rate, db, { email, password: passwordA },
    ),
    (err: unknown) => err instanceof UnauthorizedError && err.code === 'AUTH_USER_DEACTIVATED',
  );
  assert.deepEqual(rate.log.recorded, [{ tenantId: tenantA, email }]);
});

test('email sign-in: a disabled account does not offer a choice when another organization is active', async () => {
  const rate = limiter();
  const result = await withSecret(() => signInByEmail(
    lookupOf([
      account(tenantA, 'Alpha', { deactivatedAt: new Date('2026-11-01T00:00:00Z') }),
      account(tenantB, 'Bravo'),
    ]),
    rate, db, { email, password: passwordA },
  ));
  assert.equal(result.kind, 'signed-in');
  if (result.kind !== 'signed-in') return;
  assert.equal(result.user.tenantId, tenantB);
});

test('email sign-in: accounts without a local password are never candidates', async () => {
  const rate = limiter();
  await assert.rejects(
    () => signInByEmail(
      lookupOf([account(tenantA, 'Alpha', { passwordHash: null })]),
      rate, db, { email, password: passwordA },
    ),
    (err: unknown) => err instanceof UnauthorizedError && err.message === 'Invalid email or password',
  );
  assert.deepEqual(rate.log, { asserted: [], recorded: [], cleared: [] });
});
