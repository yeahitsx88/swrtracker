import assert from 'node:assert/strict';
import test from 'node:test';
import { safeReturnPath } from '@/app/ui/api';
import { localDateTime } from '@/app/ui/request-types';

test('login return path preserves request drafts and rejects external destinations', () => {
  const request = '/project/12345678-1234-1234-1234-123456789abc/request';
  const draft = request + '?draft=abcdefab-1234-1234-1234-123456789abc';
  assert.equal(safeReturnPath(request), request);
  assert.equal(safeReturnPath(draft), draft);
  const detail = '/tickets/12345678-1234-1234-1234-123456789abc';
  const list = '/project/12345678-1234-1234-1234-123456789abc/requests';
  assert.equal(safeReturnPath(detail), detail);
  assert.equal(safeReturnPath(list), list);
  const help='/project/12345678-1234-1234-1234-123456789abc/help';
  assert.equal(safeReturnPath(help),help);
  const reports='/project/12345678-1234-1234-1234-123456789abc/reports';
  assert.equal(safeReturnPath(reports),reports);
  assert.equal(safeReturnPath(reports+'?next=https://example.test'),'/drafts');
  assert.equal(safeReturnPath('/audit'),'/audit');
  assert.equal(safeReturnPath('/tenant-health'),'/tenant-health');
  assert.equal(safeReturnPath('/tenant-health?next=https://example.test'),'/drafts');
  assert.equal(safeReturnPath('/audit?next=https://example.test'),'/drafts');
  assert.equal(safeReturnPath(help+'?next=https://example.test'),'/drafts');
  const invite = '/invites/accept?token=abcdefab-1234-1234-1234-123456789abc';
  assert.equal(safeReturnPath(invite), invite);
  assert.equal(safeReturnPath(invite + '&next=https://example.test'), '/drafts');
  for (const input of ['https://example.test', '//example.test', '/\\example.test',
    '/login?next=https://example.test', request + '?next=https://example.test']) {
    assert.equal(safeReturnPath(input), '/drafts');
  }
});

test('request editor date conversion round-trips the local minute', () => {
  const source = new Date(2026, 9, 2, 9, 30);
  const input = localDateTime(source.toISOString());
  assert.equal(input, '2026-10-02T09:30');
  assert.equal(new Date(input).getTime(), source.getTime());
  assert.equal(localDateTime(null), '');
});
