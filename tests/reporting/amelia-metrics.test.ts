import test from 'node:test';
import assert from 'node:assert/strict';
import { getAmeliaMetrics } from '@/modules/reporting/application/amelia-metrics';
import type { DbClient } from '@/shared/types';
import type { UUID } from '@/shared/types';

test('Amelia metrics reconcile the four approved operating measures', async () => {
  const db: DbClient = { query: async <T extends object>(sql: string) => ({
    rows: (sql.includes('AVG(EXTRACT') ? [{
      open_total: 7, approved_unassigned: 3, overdue: 2, completed_total: 5, avg_cycle_hours: '36.5',
    }] : [
      { area_id: 'area-1', area_name: 'North', status: 'APPROVED', count: 3 },
      { area_id: 'area-1', area_name: 'North', status: 'SUBMITTED', count: 4 },
    ]) as T[],
  }) };
  const metrics = await getAmeliaMetrics(db, {
    tenantId: 'tenant-1' as UUID, projectId: 'project-1' as UUID, today: '2026-09-24',
  });
  assert.equal(metrics.openTotal, 7);
  assert.equal(metrics.approvedWithoutInstrumentMan, 3);
  assert.equal(metrics.overdueNeedBy, 2);
  assert.equal(metrics.averageSubmissionToCompletionHours, 36.5);
  assert.deepEqual(metrics.openByAreaStatus.map((row) => row.count), [3, 4]);
});
