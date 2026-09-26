import type { CadActivationPort } from '../application/activate-cad';
import type { DbClient, UUID } from '@/shared/types';
import type { CadReviewPort } from '../application/sign-off-cad';
import type { CadProgressPort, CadProgressRecord } from '../application/progress-cad';

export class CadReviewRepository implements CadReviewPort, CadProgressPort, CadActivationPort {
  async lock(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<CadProgressRecord[]> {
    return (await db.query<CadProgressRecord>(
      `SELECT id,cad_status AS status,cad_completed_at AS "completedAt",cad_assigned_to AS "assignedTo"
       FROM cad_work WHERE tenant_id=$1 AND ticket_id=$2 LIMIT 2 FOR UPDATE`,
      [tenantId, ticketId],
    )).rows;
  }
  async advance(db: DbClient, tenantId: UUID, recordId: UUID, actorId: UUID,
    from: 'NOT_STARTED' | 'IN_PROGRESS', to: 'IN_PROGRESS' | 'QA_PENDING') {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE cad_work SET cad_status=$5
       WHERE tenant_id=$1 AND id=$2 AND cad_assigned_to=$3 AND cad_status=$4 RETURNING id`,
      [tenantId, recordId, actorId, from, to],
    );
    return rows.length === 1;
  }
  async activate(db: DbClient, tenantId: UUID, recordId: UUID, assigneeId: UUID) {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE cad_work SET cad_status='NOT_STARTED',cad_assigned_to=$3
       WHERE tenant_id=$1 AND id=$2 AND cad_status='NOT_REQUIRED' AND cad_assigned_to IS NULL RETURNING id`,
      [tenantId, recordId, assigneeId],
    );
    return rows.length === 1;
  }
  async complete(db: DbClient, tenantId: UUID, recordId: UUID, actorId: UUID, completedAt: Date) {
    const { rows } = await db.query<{ id: UUID }>(
      `UPDATE cad_work SET cad_status='COMPLETE',cad_reviewed_by=$3,cad_completed_at=$4
       WHERE tenant_id=$1 AND id=$2 AND cad_status='QA_PENDING' RETURNING id`,
      [tenantId, recordId, actorId, completedAt],
    );
    return rows.length === 1;
  }
}
