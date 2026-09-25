import { appendAuditEvent } from '@/modules/audit/application/index';
import type { DbClient, UUID } from '@/shared/types';
import type { ITicketRepository } from './ports';

/** Run inside one transaction; callers repeat batches until fewer than limit are returned. */
export async function expireStaleDrafts(repo: ITicketRepository, db: DbClient,
  tenantId: UUID, limit = 100): Promise<number> {
  const drafts = await repo.findStaleDraftsForExpiry(db, tenantId, limit);
  for (const draft of drafts) {
    const deletedAt = new Date();
    await repo.patchTicket(db, tenantId, draft.id, { status: 'DRAFT',
      draftDeletedAt: deletedAt, draftDeletedReason: 'AUTO_EXPIRED' });
    await appendAuditEvent(db, { ticketId: draft.id, tenantId,
      actorId: draft.requesterId, eventType: 'ticket.draft_expired',
      payload: { reason: 'AUTO_EXPIRED', systemGenerated: true,
        lastSavedAt: draft.draftLastSavedAt ?? draft.createdAt } });
  }
  return drafts.length;
}

/** Run inside one transaction so the audit record, tombstone and deletion commit together. */
export async function purgeDeletedDrafts(repo: ITicketRepository, db: DbClient,
  tenantId: UUID, limit = 100): Promise<number> {
  const drafts = await repo.findDraftsForPurge(db, tenantId, limit);
  for (const draft of drafts) {
    await appendAuditEvent(db, { ticketId: draft.id, tenantId,
      actorId: draft.requesterId, eventType: 'ticket.draft_hard_deleted',
      payload: { ticketId: draft.id, draftDeletedReason: draft.draftDeletedReason,
        systemGenerated: true } });
    await repo.purgeDraft(db, tenantId, draft.id);
  }
  return drafts.length;
}
