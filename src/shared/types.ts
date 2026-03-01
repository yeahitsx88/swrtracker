/**
 * Primitive branded types used across modules.
 * Keep this file small — domain-specific types live in their own modules.
 */

export type UUID = string & { readonly __brand: 'UUID' };

/**
 * Minimal query interface satisfied by both pg Pool and PoolClient.
 * Application-layer use cases accept this instead of importing pg directly.
 */
export interface DbClient {
  query<T extends object = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

/** Paginated list response shape for all list endpoints. */
export interface Page<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
