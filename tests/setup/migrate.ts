import fs from 'fs';
import path from 'path';
import { getTestPool } from './db';

function getMigrationFiles(): string[] {
  const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => path.join(migrationsDir, file));
}

export async function resetDatabase(): Promise<void> {
  const pool = getTestPool();
  const client = await pool.connect();

  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');

    for (const file of getMigrationFiles()) {
      const sql = fs.readFileSync(file, 'utf8');
      await client.query(sql);
    }
  } finally {
    client.release();
  }
}
