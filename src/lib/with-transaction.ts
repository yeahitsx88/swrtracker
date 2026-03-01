/**
 * Wraps a callback in a pg transaction (BEGIN / COMMIT / ROLLBACK).
 * Use this in route handlers for any operation that touches multiple tables.
 *
 * The PoolClient passed to the callback satisfies DbClient from shared/types.ts.
 * We cast via unknown because Pool.connect() has a void overload that confuses
 * ReturnType — the cast is safe since PoolClient structurally satisfies DbClient.
 */
import type { DbClient } from '@/shared/types';
import { getPool } from './db';

export async function withTransaction<T>(
  fn: (client: DbClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client as unknown as DbClient);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
