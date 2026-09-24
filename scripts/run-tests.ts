/**
 * Register the existing node:test files in one process.
 * Several route tests intentionally share module setup, so separate-file test
 * isolation changes their environment rather than exercising the same suite.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function collectTests(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTests(path));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(path);
    }
  }

  return files.sort();
}

async function main(): Promise<void> {
  const files = await collectTests(join(process.cwd(), 'tests'));
  if (files.length === 0) {
    throw new Error('No test files found under tests/');
  }

  for (const file of files) {
    await import(pathToFileURL(file).href);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
