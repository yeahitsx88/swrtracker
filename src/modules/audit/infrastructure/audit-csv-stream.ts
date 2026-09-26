import type { DbClient } from '@/shared/types';
import { exportAuditCsv, type AuditExportQuery } from '../application/audit-csv';
import { AuditLogRepository } from './audit-log.repository';

interface ExportPool {
  connect(): Promise<DbClient & { release(): void }>;
}

/** The generator owns the connection until completion, cancellation, or failure. */
export async function openAuditCsv(pool: ExportPool, query: AuditExportQuery): Promise<ReadableStream<Uint8Array>> {
  async function* transaction() {
    const db = await pool.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      yield* exportAuditCsv(new AuditLogRepository(), db, query);
    } finally {
      try { await db.query('ROLLBACK'); } finally { db.release(); }
    }
  }
  const iterator = transaction();
  // Authorize, validate, and fetch the first page before HTTP success is sent.
  let first: IteratorResult<string> | undefined = await iterator.next();
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = first ?? await iterator.next();
        first = undefined;
        if (result.done) controller.close();
        else controller.enqueue(encoder.encode(result.value));
      } catch (error) { controller.error(error); }
    },
    async cancel() { await iterator.return(); },
  });
}
