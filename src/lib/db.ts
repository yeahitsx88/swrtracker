import { Pool } from 'pg';

// Lazy singleton — pool is created on first access, not at module load.
// This prevents build-time failures when DATABASE_URL is not set.
let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    _pool = new Pool({ connectionString });
  }
  return _pool;
}

/** Convenience alias — use getPool() in modules that need explicit error context. */
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
