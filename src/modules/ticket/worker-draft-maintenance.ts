/** Daily draft expiry and retention sweep. Run as a separate process. */
import { getPool } from '@/lib/db';
import { setTimeout as delay } from 'node:timers/promises';
import type { UUID } from '@/shared/types';
import { expireStaleDrafts, purgeDeletedDrafts } from './application/draft-maintenance';
import { TicketRepository } from './infrastructure/ticket.repository';
import { processAttachmentPurgeQueue, sweepOrphanedAttachments } from
  '@/modules/attachment/application/index';
import { AttachmentRepository, VolumeAttachmentStorage } from
  '@/modules/attachment/infrastructure/index';

async function sweep(): Promise<{ expired: number; purged: number;
  attachmentObjectsRemoved: number; orphanedObjectsRemoved: number }> {
  const pool = getPool();
  const repo = new TicketRepository();
  const attachmentRepo = new AttachmentRepository();
  const storage = new VolumeAttachmentStorage();
  const { rows: tenants } = await pool.query<{ id: UUID }>(
    'SELECT id FROM tenants ORDER BY id');
  let expired = 0;
  let purged = 0;
  let attachmentObjectsRemoved = 0;
  let orphanedObjectsRemoved = 0;
  for (const { id: tenantId } of tenants) {
    for (const action of [expireStaleDrafts, purgeDeletedDrafts]) {
      let count: number;
      do {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          count = await action(repo, client, tenantId, 100);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
        if (action === expireStaleDrafts) expired += count;
        else purged += count;
      } while (count === 100);
    }
    let removed: number;
    do {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await processAttachmentPurgeQueue(
          attachmentRepo, storage, client, tenantId, 100);
        removed = result.processed;
        attachmentObjectsRemoved += result.processed;
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } while (removed === 100);
    const orphaned = await sweepOrphanedAttachments(
      attachmentRepo, storage, pool, tenantId);
    orphanedObjectsRemoved += orphaned.removed;
  }
  return { expired, purged, attachmentObjectsRemoved, orphanedObjectsRemoved };
}

async function main(): Promise<void> {
  const pool = getPool();
  let stopping = false;
  const stop = new AbortController();
  process.once('SIGINT', () => { stopping = true; stop.abort(); });
  process.once('SIGTERM', () => { stopping = true; stop.abort(); });
  try {
    while (!stopping) {
      const result = await sweep();
      process.stdout.write(`draft maintenance: ${JSON.stringify(result)}\n`);
      if (stopping) break;
      try { await delay(24 * 60 * 60 * 1000, undefined, { signal: stop.signal }); }
      catch (error) { if (!stop.signal.aborted) throw error; }
    }
  } finally {
    await pool.end();
  }
}

void main().catch(error => {
  process.stderr.write(`draft maintenance stopped: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
