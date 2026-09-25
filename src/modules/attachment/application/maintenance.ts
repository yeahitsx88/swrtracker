import type { DbClient, UUID } from '@/shared/types';
import type { IAttachmentRepository, IAttachmentStorage, StoredObject } from './ports';

const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const REFERENCE_BATCH = 128;

/** Call inside a database transaction; claimed queue rows stay locked until commit. */
export async function processAttachmentPurgeQueue(
  repo: IAttachmentRepository, storage: IAttachmentStorage, db: DbClient,
  tenantId: UUID, limit = 100,
): Promise<{ processed: number; failed: number }> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Purge batch limit must be 1-500');
  }
  const items = await repo.claimPurgeBatch(db, tenantId, limit);
  let processed = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await storage.remove(item.storageKey);
    } catch (error) {
      await repo.markPurgeFailed(db, tenantId, item.id,
        error instanceof Error ? error.message : String(error));
      failed++;
      continue;
    }
    await repo.markPurgeDone(db, tenantId, item.id);
    processed++;
  }
  return { processed, failed };
}

/** Daily sweep of unreferenced objects, with a grace period for in-flight uploads. */
export async function sweepOrphanedAttachments(
  repo: IAttachmentRepository, storage: IAttachmentStorage, db: DbClient,
  tenantId: UUID, now = new Date(),
): Promise<{ scanned: number; removed: number }> {
  let scanned = 0;
  let removed = 0;
  let batch: StoredObject[] = [];
  async function flush(): Promise<void> {
    if (!batch.length) return;
    const references = await repo.findReferencedKeys(db, tenantId,
      batch.map(object => object.storageKey));
    for (const object of batch) {
      if (!references.has(object.storageKey)) {
        await storage.remove(object.storageKey);
        removed++;
      }
    }
    batch = [];
  }
  for await (const object of storage.listTenantObjects(tenantId)) {
    scanned++;
    if (now.getTime() - object.modifiedAt.getTime() < ORPHAN_GRACE_MS) continue;
    batch.push(object);
    if (batch.length >= REFERENCE_BATCH) await flush();
  }
  await flush();
  return { scanned, removed };
}
