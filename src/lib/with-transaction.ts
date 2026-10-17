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
import type { NextRequest } from 'next/server';
import type { AuthContext } from './auth';
import { acquireTenantLifecycleLock, revalidateMutationAuth } from './tenant-lifecycle-lock';

/** Explicit per-request coordination. Authority check runs before the callback, including replay. */
export interface AuthenticatedMutation {
  req: NextRequest;
  auth: AuthContext;
  mode: 'SHARED' | 'EXCLUSIVE';
  authorize: (db: DbClient, auth: AuthContext) => Promise<void>;
}

/** Caller must already hold its transaction on this client. */
export async function beginAuthenticatedMutation(db: DbClient, mutation: AuthenticatedMutation): Promise<void> {
  await acquireTenantLifecycleLock(db, mutation.auth.tenantId, mutation.mode);
  const current = await revalidateMutationAuth(db, mutation.req, mutation.auth);
  await mutation.authorize(db, current);
}

export async function withTransaction<T>(
  fn: (client: DbClient) => Promise<T>,
  mutation?: AuthenticatedMutation,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (mutation) await beginAuthenticatedMutation(client as unknown as DbClient, mutation);
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
