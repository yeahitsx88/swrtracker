import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => entry.isDirectory()
    ? sources(join(directory, entry.name)) : Promise.resolve(entry.name.endsWith('.ts') ? [join(directory, entry.name)] : [])));
  return groups.flat();
}

test('every direct SQL writer has an explicit lifecycle inventory disposition', async () => {
  const inventory = JSON.parse(await readFile('audits/phase5-lifecycle-writers.json', 'utf8')) as Record<string, string>;
  const uncovered: string[] = [];
  for (const file of await sources('src')) {
    if (/\bINSERT\s+INTO\b|\bUPDATE\s+(?:[a-z_]+|\$\{[^}]+\})\s+SET\b|\bDELETE\s+FROM\b/i.test(await readFile(file, 'utf8'))) {
      const normalized = file.replaceAll('\\', '/');
      if (!inventory[normalized]) uncovered.push(normalized);
    }
  }
  assert.deepEqual(uncovered, [], 'new writers require traced entry points, lock/eligibility disposition and race evidence');
  for (const [file, disposition] of Object.entries(inventory)) {
    assert.ok(disposition.trim().length > 50, file);
    await readFile(file, 'utf8');
  }
});
