import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { LocalAttachmentStorage, MAX_ATTACHMENT_BYTES, validateAttachmentObjectMetadata } from '@/modules/attachment/infrastructure';
import { ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID;
const ticketId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID;

test('LocalAttachmentStorage round-trips bytes behind a server-generated key and digest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'swr-attachment-'));
  try {
    const storage = new LocalAttachmentStorage(root);
    const bytes = new TextEncoder().encode('sample Amelia PDF bytes');
    const stored = await storage.write(tenantId, ticketId, bytes);
    assert.match(stored.storageKey, new RegExp(`^${tenantId}/${ticketId}/[a-f0-9-]+$`));
    assert.match(stored.contentSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(await storage.read(stored.storageKey), Buffer.from(bytes));
    await storage.remove(stored.storageKey);
    await assert.rejects(() => storage.read(stored.storageKey));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('attachment validation enforces the allowlist and 30 MB limit', () => {
  const valid = {
    filename: 'layout.pdf', mimeType: 'application/pdf', storageKey: `${tenantId}/${ticketId}/file`,
    sizeBytes: 1024, purpose: 'REQUEST_INSTRUCTION' as const, returnCycle: 0, contentSha256: 'a'.repeat(64),
  };
  assert.doesNotThrow(() => validateAttachmentObjectMetadata(valid));
  assert.throws(() => validateAttachmentObjectMetadata({ ...valid, filename: 'script.html', mimeType: 'text/html' }), ValidationError);
  assert.throws(() => validateAttachmentObjectMetadata({ ...valid, sizeBytes: MAX_ATTACHMENT_BYTES + 1 }), ValidationError);
});
