import test from 'node:test';
import assert from 'node:assert/strict';
import { getSafeReturnPath } from '@/lib/safe-return-path';

test('accepts same-origin paths and preserves query and hash', () => {
  assert.equal(getSafeReturnPath('/tickets?status=OPEN#list'), '/tickets?status=OPEN#list');
});

test('falls back for external, protocol-relative, and malformed destinations', () => {
  assert.equal(getSafeReturnPath('https://attacker.example/phish'), '/projects');
  assert.equal(getSafeReturnPath('//attacker.example/phish'), '/projects');
  assert.equal(getSafeReturnPath('/\\attacker.example/phish'), '/projects');
  assert.equal(getSafeReturnPath(null), '/projects');
});
