import type { DbClient, UUID } from '@/shared/types';

export interface AmeliaMetrics {
  openTotal: number;
  openByAreaStatus: Array<{ areaId: UUID; areaName: string; status: string; count: number }>;
  approvedWithoutInstrumentMan: number;
  overdueNeedBy: number;
  completedTotal: number;
  averageSubmissionToCompletionHours: number | null;
}

export async function getAmeliaMetrics(
  db: DbClient,
  params: { tenantId: UUID; projectId: UUID; today?: string },
): Promise<AmeliaMetrics> {
  const today = params.today ?? new Date().toISOString().slice(0, 10);
  const terminal = ['COMPLETED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED', 'REJECTED'];
  const { rows: summary } = await db.query<{
      open_total: number; approved_unassigned: number; overdue: number; completed_total: number; avg_cycle_hours: number | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE NOT (status = ANY($3::text[])))::int AS open_total,
         COUNT(*) FILTER (WHERE status = 'APPROVED' AND assigned_instrument_man_id IS NULL)::int AS approved_unassigned,
         COUNT(*) FILTER (WHERE NOT (status = ANY($3::text[])) AND requested_date < $4::date)::int AS overdue,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_total,
         AVG(EXTRACT(EPOCH FROM (completed_at - first_submitted_at)) / 3600.0)
           FILTER (WHERE status = 'COMPLETED' AND completed_at IS NOT NULL AND first_submitted_at IS NOT NULL) AS avg_cycle_hours
       FROM tickets WHERE tenant_id = $1 AND project_id = $2`,
      [params.tenantId, params.projectId, terminal, today],
    );
  const { rows: breakdown } = await db.query<{ area_id: UUID; area_name: string; status: string; count: number }>(
      `SELECT a.id AS area_id, a.name AS area_name, t.status, COUNT(*)::int AS count
       FROM tickets t JOIN aor_nodes a ON a.tenant_id = t.tenant_id AND a.id = t.aor_node_id
       WHERE t.tenant_id = $1 AND t.project_id = $2 AND NOT (t.status = ANY($3::text[]))
       GROUP BY a.id, a.name, t.status ORDER BY a.name, t.status`,
      [params.tenantId, params.projectId, terminal],
    );
  const row = summary[0] ?? { open_total: 0, approved_unassigned: 0, overdue: 0, completed_total: 0, avg_cycle_hours: null };
  return {
    openTotal: row.open_total,
    openByAreaStatus: breakdown.map((item) => ({ areaId: item.area_id, areaName: item.area_name, status: item.status, count: item.count })),
    approvedWithoutInstrumentMan: row.approved_unassigned,
    overdueNeedBy: row.overdue,
    completedTotal: row.completed_total,
    averageSubmissionToCompletionHours: row.avg_cycle_hours === null ? null : Number(row.avg_cycle_hours),
  };
}
