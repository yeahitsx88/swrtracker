import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { PasswordResetRateLimitRepository } from '@/modules/identity/infrastructure/password-reset-rate-limit.repository';
import { dispatchPasswordResetEmails, enqueuePasswordResetEmail } from '@/modules/identity/infrastructure/password-reset-email-outbox';
import { UserRepository } from '@/modules/identity/infrastructure/user.repository';
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID;

test('reset limiter is account-scoped, generic, and does not persist email', async () => {
  const counts = new Map<string, number>();
  const db: DbClient = {
    query: async <T extends object>(sql: string, values?: unknown[]) => {
      if (sql.includes('FROM tenants')) return { rows: [{ exists: true }] as T[] };
      if (sql.includes('FROM users')) return { rows: [{ id: String(values?.[1]) }] as T[] };
      const key = String(values?.[0]);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return { rows: [{ attempts: next }] as T[] };
    },
  };
  const req = new NextRequest('http://localhost/api/auth/forgot-password', { method: 'POST' });
  const limiter = new PasswordResetRateLimitRepository();
  for (let i = 0; i < 3; i += 1) {
    assert.equal(await limiter.allowAttempt(db, tenantId, 'field@example.com', req), true);
  }
  assert.equal(await limiter.allowAttempt(db, tenantId, 'field@example.com', req), false);
  assert.equal(await limiter.allowAttempt(db, tenantId, 'other@example.com', req), true);
  assert.equal([...counts.keys()].some((key) => key.includes('example.com')), false);
});

test('reset token repository locks the token and rejects a second consumption', async () => {
  let selectSql = '';
  const repo = new UserRepository();
  const db: DbClient = {
    query: async <T extends object>(sql: string) => {
      if (sql.includes('FROM password_reset_tokens')) {
        selectSql = sql;
        return { rows: [] as T[] };
      }
      return { rows: [] as T[] };
    },
  };
  await repo.findActivePasswordResetTokenByHash(db, 'hash', new Date());
  assert.match(selectSql, /FOR UPDATE/);
  await assert.rejects(() => repo.markPasswordResetTokenUsed(db, tenantId, new Date()), ValidationError);
});

test('source cap avoids unbounded email rows without blocking another tenant', async () => {
  const priorTrust = process.env.TRUST_PROXY_IP_HEADERS;
  process.env.TRUST_PROXY_IP_HEADERS = 'true';
  const counts = new Map<string, number>();
  const db: DbClient = {
    query: async <T extends object>(sql: string, values?: unknown[]) => {
      if (sql.includes('FROM tenants')) return { rows: [{ exists: true }] as T[] };
      if (sql.includes('FROM users')) return { rows: [{ id: String(values?.[1]) }] as T[] };
      const key = String(values?.[0]);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return { rows: [{ attempts: next }] as T[] };
    },
  };
  const req = new NextRequest('http://localhost/api/auth/forgot-password', {
    method: 'POST', headers: { 'x-real-ip': '192.0.2.41' },
  });
  const limiter = new PasswordResetRateLimitRepository();
  try {
    for (let i = 0; i < 30; i += 1) {
      assert.equal(await limiter.allowAttempt(db, tenantId, `user${i}@example.com`, req), true);
    }
    const keysBeforeDenial = counts.size;
    assert.equal(await limiter.allowAttempt(db, tenantId, 'new@example.com', req), false);
    assert.equal(counts.size, keysBeforeDenial);
    const otherTenant = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID;
    assert.equal(await limiter.allowAttempt(db, otherTenant, 'new@example.com', req), true);
  } finally {
    if (priorTrust === undefined) delete process.env.TRUST_PROXY_IP_HEADERS;
    else process.env.TRUST_PROXY_IP_HEADERS = priorTrust;
  }
});

test('unknown-email floods cannot deny a known account without a trusted source header', async () => {
  const previousTrust = process.env.TRUST_PROXY_IP_HEADERS;
  process.env.TRUST_PROXY_IP_HEADERS = 'false';
  const counts = new Map<string, number>();
  const db: DbClient = {
    query: async <T extends object>(sql: string, values?: unknown[]) => {
      if (sql.includes('FROM tenants')) return { rows: [{ exists: true }] as T[] };
      if (sql.includes('FROM users')) {
        return { rows: String(values?.[1]) === 'known@example.com'
          ? [{ id: 'known-user' }] as T[] : [] as T[] };
      }
      const key = String(values?.[0]);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return { rows: [{ attempts: next }] as T[] };
    },
  };
  const req = new NextRequest('http://localhost/api/auth/forgot-password', { method: 'POST' });
  const limiter = new PasswordResetRateLimitRepository();
  try {
    for (let i = 0; i < 1001; i += 1) {
      assert.equal(await limiter.allowAttempt(db, tenantId, `unknown${i}@example.com`, req), true);
    }
    assert.equal(counts.size, 0);
    assert.equal(await limiter.allowAttempt(db, tenantId, 'known@example.com', req), true);
    assert.equal(counts.size, 1);
  } finally {
    if (previousTrust === undefined) delete process.env.TRUST_PROXY_IP_HEADERS;
    else process.env.TRUST_PROXY_IP_HEADERS = previousTrust;
  }
});

test('reset email outbox encrypts bearer link at rest and clears it after delivery', async () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousWebhook = process.env.EMAIL_WEBHOOK_URL;
  const previousFetch = globalThis.fetch;
  process.env.JWT_SECRET = 'outbox-test-secret';
  process.env.EMAIL_WEBHOOK_URL = 'https://mail.example.test/send';
  let encrypted = '';
  let status = 'PENDING';
  let delivered = '';
  const db: DbClient = {
    query: async <T extends object>(sql: string, values?: unknown[]) => {
      if (sql.includes('INSERT INTO password_reset_email_outbox')) {
        encrypted = String(values?.[2]);
        return { rows: [] as T[] };
      }
      if (sql.includes('RETURNING o.id')) {
        return { rows: [{ id: 'job-1', tenant_id: tenantId, encrypted_payload: encrypted,
          expires_at: new Date(Date.now() + 60_000) }] as T[] };
      }
      if (sql.includes("status = 'SENT'")) status = 'SENT';
      return { rows: [] as T[] };
    },
  };
  globalThis.fetch = async (_input, init) => {
    delivered = String(init?.body);
    return new Response(null, { status: 200 });
  };
  try {
    await enqueuePasswordResetEmail(db, {
      tenantId, recipientEmail: 'field@example.com', resetToken: 'secret-bearer-token',
      appBaseUrl: 'https://app.example.test',
    });
    assert.equal(encrypted.includes('secret-bearer-token'), false);
    assert.equal(encrypted.includes('field@example.com'), false);
    assert.equal(await dispatchPasswordResetEmails(db), 1);
    assert.equal(status, 'SENT');
    assert.match(delivered, /secret-bearer-token/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousWebhook === undefined) delete process.env.EMAIL_WEBHOOK_URL;
    else process.env.EMAIL_WEBHOOK_URL = previousWebhook;
  }
});
