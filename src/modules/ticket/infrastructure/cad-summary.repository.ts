import type { DbClient, UUID } from '@/shared/types';
import type { CadSummary, CadSummaryPort } from '../application/cad-summary';

export class CadSummaryRepository implements CadSummaryPort {
  async find(db: DbClient, tenantId: UUID, ticketId: UUID): Promise<CadSummary[]> {
    const { rows } = await db.query<CadSummary>(
      `SELECT cad_status AS status, cad_completed_at AS "completedAt"
       FROM cad_work WHERE tenant_id=$1 AND ticket_id=$2 LIMIT 2`,
      [tenantId, ticketId],
    );
    return rows;
  }
}
