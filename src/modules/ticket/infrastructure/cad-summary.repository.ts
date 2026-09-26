import type { DbClient, UUID } from '@/shared/types';
import type { CadDetailSummary, CadSummaryPort } from '../application/cad-summary';

export class CadSummaryRepository implements CadSummaryPort {
  async find(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<CadDetailSummary[]> {
    const { rows } = await db.query<CadDetailSummary>(
      `SELECT cad_reviewed_by AS "reviewedBy", cad_assigned_to AS "assignedTo", cad_status AS status, cad_completed_at AS "completedAt"
       FROM cad_work WHERE tenant_id=$1 AND ticket_id=$2 LIMIT 2`,
      [tenantId, ticketId],
    );
    return rows;
  }
}
