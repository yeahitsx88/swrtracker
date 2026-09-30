// Read-only acceptance on the explicitly selected Sabine live simulation.
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { TicketRepository } from '../../src/modules/ticket/infrastructure/ticket.repository';
import { resolveVisibility } from '../../src/lib/resolve-visibility';
import type { ProjectRole } from '../../src/modules/identity/domain/types';
import type { TicketQueryFilters } from '../../src/modules/ticket/application/query-filters';
import type { UUID } from '../../src/shared/types';

async function main() {
  assert.equal(process.env.SWR_QUERY_SMOKE, '1');
  assert.ok(process.env.DATABASE_URL);
  assert.equal(new URL(process.env.DATABASE_URL).pathname, '/swr_sabine_simulation');
  const tenant = process.env.SWR_TEST_TENANT as UUID;
  const project = process.env.SWR_TEST_PROJECT as UUID;
  assert.ok(tenant && project);
  const db = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const repo = new TicketRepository();
  let checks = 0;
  try {
    const { rows: actors } = await db.query<{ id: UUID; role: ProjectRole }>(
      `SELECT u.id, pm.role FROM users u JOIN project_memberships pm ON pm.user_id=u.id
       JOIN projects p ON p.id=pm.project_id AND p.tenant_id=u.tenant_id
       WHERE u.tenant_id=$1 AND p.id=$2 AND u.email = ANY($3::text[]) AND u.deactivated_at IS NULL`,
      [tenant, project, ['manager@sabine.example', 'super1@sabine.example', 'chief1@sabine.example', 'im1.1@sabine.example', 'requester0@sabine.example', 'admin@sabine.example']],
    );
    assert.equal(actors.length, 6);
    for (const actor of actors) {
      const visibility = await resolveVisibility(db, tenant, project, actor.id, actor.role);
      const base = await repo.list(db, tenant, { projectId: project, visibility, limit: 200, offset: 0, sort: 'operations' });
      assert.ok(base.total <= 200, 'Fixture must fit in one independently scoped baseline page');
      const filters: TicketQueryFilters[] = [{}, { queue: 'assignment' }, { queue: 'open' }, { queue: 'completed' }, { queue: 'overdue' }, { status: 'SUBMITTED', priority: 'HIGH' }, { ticketType: 'LAYOUT' }, { areaId: '00000000-0000-4000-8000-000000000000' }, { query: "%_' OR 1=1 --" }];
      if (base.data[0]) filters.push({ areaId: base.data[0].aorNodeId, query: 'LIVE SIMULATION' });
      for (const filter of filters) {
        const closed = ['COMPLETED','REJECTED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED'];
        const expected = base.data.filter(t =>
          (!filter.queue || (filter.queue === 'assignment' ? t.status === 'APPROVED' && !t.assignedInstrumentManId :
            filter.queue === 'completed' ? t.status === 'COMPLETED' : !closed.includes(t.status) && (filter.queue !== 'overdue' || t.requestedDate.toISOString().slice(0,10) < new Date().toISOString().slice(0,10)))) &&
          (!filter.status || t.status === filter.status) && (!filter.priority || t.priority === filter.priority) &&
          (!filter.ticketType || t.ticketType === filter.ticketType) && (!filter.areaId || t.aorNodeId === filter.areaId) &&
          (!filter.query || [t.ticketNumber,t.description,t.fieldContact].some(v=>v?.toLowerCase().includes(filter.query!.toLowerCase()))));
        for (const offset of [0,3]) {
          const result = await repo.list(db, tenant, { projectId: project, visibility, filters: filter, sort: 'operations', limit: 3, offset });
          assert.equal(result.total, expected.length, `${actor.role} filtered count`);
          assert.deepEqual(result.data.map(t=>t.id), expected.slice(offset,offset+3).map(t=>t.id), `${actor.role} filtered page`);
          checks++;
        }
      }
      const wrongTenant = await repo.list(db, '00000000-0000-4000-8000-000000000000' as UUID, { projectId: project, visibility, filters: { queue: 'open' }, limit: 3, offset: 0 });
      assert.equal(wrongTenant.total, 0);
      checks++;
    }
    console.log(`Ticket query PostgreSQL smoke passed: ${checks} count/page/isolation checks across ${actors.length} roles; no data changed.`);
  } finally { await db.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Ticket query smoke failed'); process.exitCode=1; });
