import test from 'node:test';
import assert from 'node:assert/strict';
import { ConsoleEmailTransport, sendPasswordResetEmail } from '@/lib/email';
import type { UUID } from '@/shared/types';

test('console password-reset logging never includes the bearer reset link', async () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    lines.push(String(message));
  };

  try {
    await sendPasswordResetEmail(new ConsoleEmailTransport(), {
      tenantId: 'tenant-1' as UUID,
      recipientEmail: 'field.user@example.com',
      resetToken: 'sensitive-reset-token',
      appBaseUrl: 'https://swr.example.com',
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.includes('sensitive-reset-token'), false);
  assert.equal(lines[0]?.includes('resetLink'), false);
});
