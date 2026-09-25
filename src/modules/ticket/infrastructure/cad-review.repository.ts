import type { DbClient, UUID } from '@/shared/types';
import type { CadReviewPort, CadReviewRecord } from '../application/sign-off-cad';

export class CadReviewRepository implements CadReviewPort {
  async lock(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<CadReviewRecord[]> {
    return (await db.query<CadReviewRecord>(
      `SELECT id,cad_status AS status,cad_completed_at AS "completedAt"
       FROM cad_work WHERE tenant_id=$1 AND ticket_id=$2 LIMIT 2 FOR UPDATE`,
      [tenantId, ticketId],
    )).rows;
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
