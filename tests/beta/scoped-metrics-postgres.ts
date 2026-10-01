import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pool } from 'pg';
import { getAmeliaMetrics } from '../../src/modules/reporting/application/amelia-metrics';
import { AmeliaMetricsReader } from '../../src/modules/reporting/infrastructure/amelia-metrics.reader';
import { getProjectRole } from '../../src/lib/get-project-role';
import type { VisibilityScope } from '../../src/modules/ticket/application/ports';
import type { MetricsFilters } from '../../src/modules/reporting/application/metrics-filters';
import type { UUID } from '../../src/shared/types';

// Only session-local temporary fixtures are written. Public data is never mutated.
const id = (value: string) => value as UUID;
const records = [
  ['t', 'p', 'a', 'd', 'gc', 'r', 'chief', 'im', 'SUBMITTED', '2026-01-01', null],
  ['t', 'p', 'child', 'd', 'sub', 's', 'chief', null, 'APPROVED', '2026-01-01', null],
  ['t', 'p', 'b', 'e', 'sub', 's2', 'other-chief', 'im', 'IN_PROGRESS', '2027-01-01', null],
  ['t', 'p', 'b', 'd', 'other-sub', 'other', 'other-chief', 'other-im', 'COMPLETED', '2026-01-01', '2026-01-02'],
  ['t', 'p', 'a', 'd', 'gc', 'r', 'chief', 'im', 'DRAFT', '2026-01-01', null],
  ['other-tenant', 'p', 'a', 'd', 'gc', 'r', 'chief', 'im', 'SUBMITTED', '2026-01-01', null],
  ['t', 'other-project', 'a', 'd', 'gc', 'r', 'chief', 'im', 'SUBMITTED', '2026-01-01', null],
  ['t', 'p', 'child', 'd', 'gc', 'r', 'chief', 'im', 'COMPLETED', '2026-01-01', '2026-01-03'],
  ['t', 'p', 'b', 'e', 'gc', 'other', 'other-chief', 'other-im', 'IN_PROGRESS', '2027-01-01', null],
  ['t', 'p', 'a', 'd', 'gc', 'other', 'chief', 'im', 'SURVEY_CANCELED', '2026-01-01', null],
];
const terminal = new Set(['COMPLETED', 'SURVEY_CANCELED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'REJECTED']);

async function main() {
  if (process.env.SWR_METRICS_POSTGRES !== '1') throw new Error('SWR_METRICS_POSTGRES=1 required');
  const config = JSON.parse(fs.readFileSync('.data/sabine/runtime.json', 'utf8'));
  if (new URL(config.DATABASE_URL).pathname !== '/swr_sabine_simulation') throw new Error('Sabine database required');
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1 });
  const db = await pool.connect();
  let scenarios = 0;
  try {
    await db.query('BEGIN');
    await db.query(`CREATE TEMP TABLE tickets (
      tenant_id text, project_id text, aor_node_id text, department_id text, company_id text,
      requester_id text, assigned_party_chief_id text, assigned_instrument_man_id text,
      status text, requested_date date, completed_at timestamptz, first_submitted_at timestamptz,
      ticket_type text DEFAULT 'LAYOUT', submitted_at timestamptz, draft_deleted_at timestamptz,
      id bigint GENERATED ALWAYS AS IDENTITY
    ) ON COMMIT DROP;
    CREATE TEMP TABLE aor_nodes (id text, tenant_id text, project_id text, name text) ON COMMIT DROP;
    CREATE TEMP TABLE companies (id text, tenant_id text, type text) ON COMMIT DROP;
    CREATE TEMP TABLE company_authority_grants (tenant_id text, project_id text, company_id text, user_id text, revoked_at timestamptz) ON COMMIT DROP;
    CREATE TEMP TABLE project_memberships (project_id text, user_id text, role text) ON COMMIT DROP;
    CREATE TEMP TABLE users (id text, tenant_id text, deactivated_at timestamptz, company_id text, session_version integer, name text) ON COMMIT DROP;
    CREATE TEMP TABLE projects (id text, tenant_id text) ON COMMIT DROP;
    CREATE TEMP TABLE crew_rosters (tenant_id text, project_id text, party_chief_id text, instrument_man_id text, deactivated_at timestamptz) ON COMMIT DROP;
    CREATE TEMP TABLE ticket_events (ticket_id bigint, tenant_id text, payload jsonb) ON COMMIT DROP;
    SET LOCAL search_path = pg_temp;`);
    // Explicit pg_temp qualification ensures writes cannot fall through to public.
    for (const record of records) await db.query(`INSERT INTO pg_temp.tickets (tenant_id,project_id,aor_node_id,department_id,company_id,requester_id,assigned_party_chief_id,assigned_instrument_man_id,status,requested_date,completed_at,first_submitted_at,ticket_type,submitted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'2026-01-01','LAYOUT','2026-01-01')`, record);
    await db.query(`INSERT INTO pg_temp.aor_nodes VALUES ('a','t','p','Area A'),('child','t','p','Area A child'),('b','t','p','Area B');
      INSERT INTO pg_temp.companies VALUES ('gc','t','GC'),('sub','t','SUBCONTRACTOR'),('other-sub','t','SUBCONTRACTOR');
      INSERT INTO pg_temp.users VALUES ('s','t',NULL,'sub',1,'Requester'),('chief','t',NULL,'gc',1,'Chief'),('im','t',NULL,'gc',1,'Instrument Man');
      INSERT INTO pg_temp.projects VALUES ('p','t');
      INSERT INTO pg_temp.crew_rosters VALUES ('t','p','chief','im',NULL);
      INSERT INTO pg_temp.project_memberships VALUES ('p','s','REQUESTER');`);
    const base: VisibilityScope = { actorId: id('r'), actorRole: 'VIEWER', projectId: id('p'), companyId: id('gc'), companyType: 'GC' };
    async function check(label: string, patch: Partial<VisibilityScope>, indexes: number[], tenantId = 't', projectId = 'p', filters: MetricsFilters = {}) {
      const metric = await getAmeliaMetrics(new AmeliaMetricsReader(), db, {
        tenantId: id(tenantId), projectId: id(projectId), today: '2026-09-29', visibility: { ...base, ...patch }, filters,
      });
      const visible = indexes.map(index => records[index - 1]!);
      const open = visible.filter(row => !terminal.has(row[8]!));
      const completed = visible.filter(row => row[8] === 'COMPLETED');
      assert.equal(metric.openTotal, open.length, label);
      assert.equal(metric.completedTotal, completed.length, label);
      assert.equal(metric.approvedWithoutInstrumentMan, visible.filter(row => row[8] === 'APPROVED' && row[7] === null).length, label);
      assert.equal(metric.overdueNeedBy, open.filter(row => row[9]! < '2026-09-29').length, label);
      const hours = completed.map(row => (Date.parse(row[10]!) - Date.parse('2026-01-01')) / 3600000);
      assert.equal(metric.averageSubmissionToCompletionHours, hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null, label);
      const expectedCells = new Map<string, number>();
      for (const row of open) { const key = `${row[2]}:${row[8]}`; expectedCells.set(key, (expectedCells.get(key) ?? 0) + 1); }
      assert.deepEqual(new Map(metric.openByAreaStatus.map(row => [`${row.areaId}:${row.status}`, row.count])), expectedCells, label);
      scenarios++;
    }
    for (const actorRole of ['SURVEY_MANAGER', 'VIEWER', 'CAD_LEAD', 'CAD_TECHNICIAN'] as const) await check(actorRole, { actorRole }, [1,2,3,4,8,9,10]);
    await check('requester own', { actorRole: 'REQUESTER' }, [1,8]);
    await check('chief', { actorRole: 'PARTY_CHIEF', actorId: id('chief') }, [1,2,8,10]);
    await check('IM crew plus direct', { actorRole: 'INSTRUMENT_MAN', actorId: id('im'), partyChiefId: id('chief') }, [1,2,3,8,10]);
    await check('IM no roster', { actorRole: 'INSTRUMENT_MAN', actorId: id('im') }, [1,3,8,10]);
    await db.query('UPDATE pg_temp.crew_rosters SET deactivated_at=NOW()');
    await check('IM revoked roster with stale Chief scope', { actorRole: 'INSTRUMENT_MAN', actorId: id('im'), partyChiefId: id('chief') }, [1,3,8,10]);
    await db.query(`INSERT INTO pg_temp.crew_rosters VALUES ('other-tenant','p','chief','im',NULL),('t','other-project','chief','im',NULL)`);
    await check('IM foreign roster does not restore inheritance', { actorRole: 'INSTRUMENT_MAN', actorId: id('im'), partyChiefId: id('chief') }, [1,3,8,10]);
    await db.query(`UPDATE pg_temp.crew_rosters SET deactivated_at=NULL WHERE tenant_id='t' AND project_id='p'`);
    await check('IM explicitly restored active crew', { actorRole: 'INSTRUMENT_MAN', actorId: id('im'), partyChiefId: id('chief') }, [1,2,3,8,10]);
    for (const actorRole of ['SURVEY_SUPERINTENDENT', 'AREA_VIEWER'] as const) {
      await check(actorRole, { actorRole, aorNodeIds: [id('a'), id('child')] }, [1,2,8,10]);
      await check(`${actorRole} missing scope`, { actorRole }, []);
    }
    await check('department', { actorRole: 'DEPARTMENT_MANAGER', departmentId: id('d') }, [1,2,4,8,10]);
    await check('department and Area', { actorRole: 'DEPARTMENT_LEAD', departmentId: id('d'), aorNodeIds: [id('b')] }, [4]);
    await check('department missing', { actorRole: 'DEPARTMENT_MANAGER' }, []);
    await check('company intersection', { actorRole: 'VIEWER', companyId: id('sub'), companyType: 'SUBCONTRACTOR' }, [2,3]);
    await check('subcontract coordinator', { actorRole: 'SUBCONTRACTS_COORDINATOR' }, [2,3,4]);
    const subcontractor = { actorRole: 'REQUESTER' as const, actorId: id('s'), companyId: id('sub'), companyType: 'SUBCONTRACTOR' };
    await check('subcontractor own without grant', subcontractor, [2]);
    await db.query(`INSERT INTO pg_temp.company_authority_grants VALUES ('t','p','sub','s',NULL)`);
    await check('company authority', subcontractor, [2,3]);
    await db.query(`UPDATE pg_temp.company_authority_grants SET revoked_at = now()`);
    await check('revoked authority', subcontractor, [2]);
    await db.query(`UPDATE pg_temp.company_authority_grants SET revoked_at = NULL; UPDATE pg_temp.users SET deactivated_at = now()`);
    await check('inactive grant holder', subcontractor, [2]);
    await check('wrong tenant', {}, [], 'unknown-tenant');
    await check('wrong project', { projectId: id('unknown-project') }, [], 't', 'unknown-project');
    await check('chief cannot select other crew', { actorRole: 'PARTY_CHIEF', actorId: id('chief') }, [], 't', 'p', { crewId: 'other-chief' });
    await check('Area intersects filters', { actorRole: 'SURVEY_SUPERINTENDENT', aorNodeIds: [id('a'), id('child')] }, [], 't', 'p', { areaId: 'b' });
    await assert.rejects(getAmeliaMetrics(new AmeliaMetricsReader(), db, { tenantId: id('t'), projectId: id('p'),
      visibility: { ...base, actorRole: 'SURVEY_SUPERINTENDENT', aorNodeIds: [id('a'), id('child')] },
      filters: { crewId: 'chief' } }), { name: 'ForbiddenError' }); scenarios++;
    await check('requester filtered completed', { actorRole: 'REQUESTER' }, [8], 't', 'p', { population: 'completed', ticketType: 'LAYOUT' });
    await check('combined supervisory filters', { actorRole: 'SURVEY_MANAGER' }, [1], 't', 'p', { crewId: 'chief', instrumentManId: 'im', areaId: 'a', status: 'SUBMITTED' });
    await check('assignment population', {}, [2], 't', 'p', { population: 'assignment' });
    await check('overdue population', {}, [1,2], 't', 'p', { population: 'overdue' });
    await check('inclusive completion day', {}, [4], 't', 'p', { dateBasis: 'completed', dateFrom: '2026-01-02', dateTo: '2026-01-02' });
    await check('submitted date', {}, [1,2,3,4,8,9,10], 't', 'p', { dateBasis: 'submitted', dateFrom: '2026-01-01', dateTo: '2026-01-01' });
    await check('empty date range', {}, [], 't', 'p', { dateBasis: 'needBy', dateFrom: '2030-01-01' });
    const chartsFor = (visibility: VisibilityScope, filters: MetricsFilters = {}) => getAmeliaMetrics(new AmeliaMetricsReader(), db, {
      tenantId: id('t'), projectId: id('p'), today: '2026-09-29', visibility, filters, includeCharts: true,
    });
    const view = await chartsFor(base);
    const superintendentCharts = await chartsFor({ ...base, actorRole: 'SURVEY_SUPERINTENDENT', aorNodeIds: [id('a'), id('child')] });
    assert.deepEqual(superintendentCharts.charts!.crews, []);
    assert.deepEqual(superintendentCharts.charts!.instrumentMen, []);
    assert.deepEqual(superintendentCharts.charts!.facets.crews, []);
    assert.deepEqual(superintendentCharts.charts!.facets.instrumentMen, []);
    scenarios++;
    const gauge = await chartsFor(base,{population:'open',areaId:'a'});
    assert.equal(gauge.total,1); assert.equal(gauge.populationTotal,2); scenarios++;
    assert.equal(view.total, 7);
    assert.equal(view.charts!.areas.reduce((sum,bucket) => sum+bucket.count,0), 7);
    assert.equal(view.charts!.types.reduce((sum,bucket) => sum+bucket.count,0), 7);
    assert.equal(view.charts!.cells.reduce((sum,bucket) => sum+bucket.count,0), 7);
    assert.equal(view.charts!.months.reduce((sum,bucket) => sum+bucket.count,0), 7);
    assert.equal(view.charts!.months.length, 13);
    assert.equal(view.charts!.months[1]!.count, 0);
    assert.deepEqual(view.charts!.crews, []);
    assert.deepEqual(view.charts!.instrumentMen, []);
    assert.deepEqual(view.charts!.facets.crews, []);
    assert.equal(view.charts!.limits.truncated, false); scenarios++;
    const chiefChart = await chartsFor({ ...base, actorRole:'PARTY_CHIEF',actorId:id('chief') });
    assert.deepEqual(chiefChart.charts!.crews.map(b => b.key), ['chief']);
    assert.ok(!chiefChart.charts!.instrumentMen.some(b => b.key === 'other-im')); scenarios++;
    const requesterChart = await chartsFor({ ...base, actorRole:'REQUESTER' });
    assert.deepEqual(requesterChart.charts!.instrumentMen, []);
    assert.equal(requesterChart.total, 2); scenarios++;
    await db.query(`INSERT INTO pg_temp.ticket_events VALUES (4,'t','{"importSnapshot":true,"completionDateGenerated":true}'),(8,'t','{"importSnapshot":true}');`);
    const provenance = await chartsFor(base);
    assert.equal(provenance.coverage!.imported, 2);
    assert.equal(provenance.coverage!.syntheticCompletions, 1);
    assert.equal(provenance.coverage!.cycleSamples, 1);
    assert.equal(provenance.averageSubmissionToCompletionHours, 48);
    assert.equal(provenance.charts!.types[0]!.cycleSamples, 1); scenarios++;
    await db.query('SAVEPOINT provenance_regression');
    await db.query(`INSERT INTO pg_temp.ticket_events VALUES
      (4,'t','{"importSnapshot":true,"completionDateGenerated":false}'),
      (4,'t','{"importSnapshot":true,"completionDateGenerated":null}'),
      (8,'t','{"importSnapshot":false,"completionDateGenerated":true}'),
      (8,'other-tenant','{"importSnapshot":true,"completionDateGenerated":true}'),
      (7,'t','{"importSnapshot":true,"completionDateGenerated":true}'),
      (5,'t','{"importSnapshot":true,"completionDateGenerated":true}');`);
    const duplicateProvenance = await chartsFor(base);
    assert.equal(duplicateProvenance.total, 7);
    assert.equal(duplicateProvenance.coverage!.imported, 2);
    assert.equal(duplicateProvenance.coverage!.syntheticCompletions, 1);
    assert.equal(duplicateProvenance.coverage!.cycleSamples, 1);
    assert.equal(duplicateProvenance.averageSubmissionToCompletionHours, 48); scenarios++;
    const ownProvenance = await chartsFor({ ...base, actorRole: 'REQUESTER' });
    assert.equal(ownProvenance.total, 2);
    assert.equal(ownProvenance.coverage!.imported, 1);
    assert.equal(ownProvenance.coverage!.syntheticCompletions, 0);
    assert.equal(ownProvenance.averageSubmissionToCompletionHours, 48); scenarios++;
    const emptyProvenance = await chartsFor(base, { dateFrom: '2030-01-01' });
    assert.equal(emptyProvenance.total, 0);
    assert.equal(emptyProvenance.coverage!.imported, 0);
    assert.equal(emptyProvenance.coverage!.syntheticCompletions, 0);
    assert.equal(emptyProvenance.averageSubmissionToCompletionHours, null); scenarios++;
    await db.query('ROLLBACK TO SAVEPOINT provenance_regression');
    await db.query(`UPDATE pg_temp.tickets SET first_submitted_at='2026-01-04' WHERE id=8`);
    const invalidCycle = await chartsFor(base);
    assert.equal(invalidCycle.coverage!.invalidCycleDates, 1);
    assert.equal(invalidCycle.averageSubmissionToCompletionHours, null); scenarios++;
    await db.query(`UPDATE pg_temp.tickets SET first_submitted_at=NULL WHERE id=8`);
    const missingCycle = await chartsFor(base);
    assert.equal(missingCycle.coverage!.missingCycleDates, 1);
    assert.equal(missingCycle.averageSubmissionToCompletionHours, null); scenarios++;
    await assert.rejects(getAmeliaMetrics(new AmeliaMetricsReader(), db, { tenantId: id('t'), projectId: id('p'), visibility: { ...base, actorRole: 'PROJECT_ADMIN' } }), { name: 'ForbiddenError' });
    scenarios++;
    await db.query('UPDATE pg_temp.users SET deactivated_at = NULL');
    assert.equal(await getProjectRole(db, id('t'), id('p'), id('s'), 1), 'REQUESTER'); scenarios++;
    await assert.rejects(getProjectRole(db, id('t'), id('p'), id('s'), 2), { name: 'UnauthorizedError' }); scenarios++;
    await db.query('UPDATE pg_temp.users SET deactivated_at = now()');
    await assert.rejects(getProjectRole(db, id('t'), id('p'), id('s'), 1), { name: 'UnauthorizedError' }); scenarios++;
    await db.query('UPDATE pg_temp.users SET deactivated_at = NULL');
    await assert.rejects(getProjectRole(db, id('other-tenant'), id('p'), id('s'), 1), { name: 'UnauthorizedError' }); scenarios++;
    await assert.rejects(getProjectRole(db, id('t'), id('other-project'), id('s'), 1), { name: 'ForbiddenError' }); scenarios++;
    await db.query('DELETE FROM pg_temp.project_memberships');
    await assert.rejects(getProjectRole(db, id('t'), id('p'), id('s'), 1), { name: 'ForbiddenError' }); scenarios++;
    await db.query(`INSERT INTO pg_temp.aor_nodes SELECT 'extra-'||n,'t','p','Extra '||n FROM generate_series(1,201) n;
      INSERT INTO pg_temp.tickets (tenant_id,project_id,aor_node_id,status,requested_date,ticket_type)
      SELECT 't','p','extra-'||n,'SUBMITTED',DATE '2000-01-01'+n*INTERVAL '1 month','TOPO' FROM generate_series(1,201) n;`);
    const bounded = await chartsFor(base);
    assert.equal(bounded.total, 208);
    assert.equal(bounded.charts!.areas.length, 200);
    assert.equal(bounded.charts!.facets.areas.length, 200);
    assert.equal(bounded.charts!.months.length, 120);
    assert.equal(bounded.charts!.limits.truncated, true); scenarios++;
    console.log(`PostgreSQL metrics: ${scenarios} scenarios passed; count, cycle and heat-map assertions; temporary fixtures only.`);
  } finally {
    await db.query('ROLLBACK');
    db.release();
    await pool.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
