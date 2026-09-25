import { appendSystemAuditEvent } from '@/modules/audit/application/index';
import type { DbClient } from '@/shared/types';
import { findStuckPcApprovals } from '../infrastructure/timeout-signal.repository';

/** Run inside a transaction every 30 minutes. */
export async function emitStuckPcSignals(db: DbClient, limit = 100): Promise<number> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Stuck approval batch limit must be 1-500');
  }
  const stuck = await findStuckPcApprovals(db, limit);
  for (const item of stuck) {
    await appendSystemAuditEvent(db, { ticketId: item.id,
      tenantId: item.tenantId, eventType: 'ticket.pc_approval_stuck',
      payload: { ticketId: item.id, status: 'PENDING_PC_APPROVAL',
        stuckSince: item.updatedAt } });
  }
  return stuck.length;
}
