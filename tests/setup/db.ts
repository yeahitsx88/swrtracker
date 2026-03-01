import { Pool, type QueryResultRow } from 'pg';

let pool: Pool | null = null;

function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for tests');
  }

  const url = new URL(connectionString);
  const dbName = url.pathname.replace(/^\//, '');
  if (!dbName) {
    throw new Error('DATABASE_URL must target a specific test database');
  }
  if (dbName === 'survey_dev') {
    throw new Error('Refusing to run tests against survey_dev; use a dedicated test database');
  }

  return connectionString;
}

export function getTestPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getConnectionString() });
  }
  return pool;
}

export async function closeTestPool(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<{ rows: T[] }> {
  const result = await getTestPool().query<T>(sql, params);
  return { rows: result.rows };
}
