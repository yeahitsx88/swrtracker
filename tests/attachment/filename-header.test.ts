import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentFilename } from '@/app/api/tickets/[ticketId]/attachments/filename-header';
import { validateAttachmentMetadata } from '@/modules/attachment/application';
import { ValidationError } from '@/shared/errors';

test('browser upload filenames preserve Unicode and literal percent sequences', () => {
  const filename = '配置 — Révision 100% %20.pdf';
  const headers = new Headers({ 'x-file-name-utf8': encodeURIComponent(filename) });
  assert.equal(validateAttachmentMetadata(attachmentFilename(headers), 'application/pdf'), filename);
  assert.equal(attachmentFilename(new Headers({ 'x-file-name': 'plan%20.pdf' })), 'plan%20.pdf');
});

test('malformed encoding and encoded unsafe paths fail before storage', () => {
  assert.throws(() => attachmentFilename(new Headers({ 'x-file-name-utf8': '%ZZ' })), ValidationError);
  assert.throws(() => attachmentFilename(new Headers()), ValidationError);
  for (const filename of ['../plan.pdf', 'plan\r\n.pdf', '']) {
    assert.throws(() => validateAttachmentMetadata(attachmentFilename(
      new Headers({ 'x-file-name-utf8': encodeURIComponent(filename) })), 'application/pdf'), ValidationError);
  }
});
