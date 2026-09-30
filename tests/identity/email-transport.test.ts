import test from 'node:test';
import assert from 'node:assert/strict';
import { ConsoleEmailTransport, sendPasswordResetEmail } from '@/lib/email';
import type { UUID } from '@/shared/types';

test('console fallback never logs or silently discards a bearer reset link', async () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => { lines.push(String(message)); };
  try {
    await assert.rejects(() => sendPasswordResetEmail(new ConsoleEmailTransport(), {
      tenantId: 'tenant-1' as UUID,
      recipientEmail: 'field.user@example.com',
      resetToken: 'sensitive-reset-token',
      appBaseUrl: 'https://swr.example.com',
    }), /EMAIL_WEBHOOK_URL is required/);
  } finally {
    console.log = originalLog;
  }
  assert.deepEqual(lines, []);
});
