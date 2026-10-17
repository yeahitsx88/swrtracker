import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { getProjectRole } from '../../src/lib/get-project-role';
import { resolveVisibility } from '../../src/lib/resolve-visibility';
import { getAmeliaMetrics, type MetricsScope } from '../../src/modules/reporting/application/amelia-metrics';
import { AmeliaMetricsReader, buildMetricsQuery } from '../../src/modules/reporting/infrastructure/amelia-metrics.reader';
import type { UUID } from '../../src/shared/types';

// Opt-in local acceptance. Public queries are READ ONLY. Synthetic writes are
// explicitly pg_temp-qualified, in a separate transaction rolled back on exit.
const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}` as UUID;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
// Capture only the former provenance join as a test comparator. Never shipped.
function legacySql(sql: string): string {
  const replaced = sql.replace(/provenance AS \([\s\S]*?\), measured AS MATERIALIZED/, `provenance AS (
    SELECT e.ticket_id, bool_or(e.payload->>'completionDateGenerated'='true') AS synthetic
    FROM ticket_events e JOIN filtered t ON t.id=e.ticket_id AND t.tenant_id=e.tenant_id
    WHERE e.tenant_id=$1 AND e.payload->>'importSnapshot'='true' GROUP BY e.ticket_id
  ), measured AS MATERIALIZED`);
  assert.notEqual(replaced, sql, 'Legacy comparator must replace exactly the current provenance CTE');
  return replaced;
}
interface PlanNode {
  'Node Type': string; 'Relation Name'?: string; 'Actual Loops'?: number; 'Actual Rows'?: number;
  Filter?: string; Plans?: PlanNode[];
  'Shared Hit Blocks'?: number; 'Shared Read Blocks'?: number; 'Temp Read Blocks'?: number; 'Temp Written Blocks'?: number;
}
async function plan(db: PoolClient, sql: string, params: unknown[]) {
  const result = await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + sql, params);
  const root = result.rows[0]['QUERY PLAN'][0] as { Plan: PlanNode; 'Execution Time': number };
  const eventScans: Array<{ loops: number; rows: number; hashed: boolean }> = [];
  function walk(node: PlanNode) {
    if (node['Relation Name'] === 'ticket_events') eventScans.push({ loops: node['Actual Loops'] ?? 0,
      rows: node['Actual Rows'] ?? 0, hashed: /hashed SubPlan/.test(node.Filter ?? '') });
    for (const child of node.Plans ?? []) walk(child);
  }
  walk(root.Plan);
  return { ms: root['Execution Time'], sharedHit: root.Plan['Shared Hit Blocks'] ?? 0,
    sharedRead: root.Plan['Shared Read Blocks'] ?? 0, tempRead: root.Plan['Temp Read Blocks'] ?? 0,
    tempWritten: root.Plan['Temp Written Blocks'] ?? 0, eventScans };
}
async function compare(db: PoolClient, name: string, scope: MetricsScope, measure = false) {
  const query = buildMetricsQuery(scope), legacy = legacySql(query.sql);
  const before = (await db.query(legacy, query.params)).rows[0].metrics;
  const after = await getAmeliaMetrics(new AmeliaMetricsReader(), db, scope);
  assert.ok(JSON.stringify(canonical(before)) === JSON.stringify(canonical(after)), `${name}: metric content changed`);
  if (measure) {
    const pairs = [];
    // Alternate order to avoid making every candidate sample the second query.
    for (let i = 0; i < 3; i++) {
      let oldPlan, newPlan;
      if (i % 2) { newPlan = await plan(db, query.sql, query.params); oldPlan = await plan(db, legacy, query.params); }
      else { oldPlan = await plan(db, legacy, query.params); newPlan = await plan(db, query.sql, query.params); }
      assert.ok(newPlan.eventScans.every(scan => scan.loops <= 1 && scan.hashed), `${name}: repeated/nonhashed event scan`);
      pairs.push({ before: oldPlan, after: newPlan });
    }
    console.log(JSON.stringify({ case: name, contentEqual: true, pairs }));
  }
  return after;
}

async function main() {
  assert.equal(process.env.SWR_PROVENANCE_PLAN, '1', 'SWR_PROVENANCE_PLAN=1 required');
  const config = JSON.parse(fs.readFileSync('.data/sabine/runtime.json', 'utf8'));
  const manifest = JSON.parse(fs.readFileSync('.data/sabine/manifest.json', 'utf8'));
  const url = new URL(config.DATABASE_URL);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '15488'); assert.equal(url.pathname, '/swr_sabine_simulation');
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 1 }), db = await pool.connect();
  let comparisons = 0;
  try {
    await db.query('BEGIN READ ONLY'); await db.query("SET LOCAL statement_timeout='10s'");
    assert.equal((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'on');
    const fingerprint = async () => (await db.query(`SELECT count(*)::int AS n,
      md5(string_agg(id::text||':'||status::text||':'||row_version::text,',' ORDER BY id)) AS hash FROM public.tickets`)).rows[0];
    const before = await fingerprint();
    for (const account of ['manager', 'super1', 'chief1', 'im1.1', 'requester0']) {
      const actor = (await db.query(`SELECT id,session_version FROM public.users
        WHERE tenant_id=$1 AND email=$2 AND deactivated_at IS NULL`, [manifest.tenantId, `${account}@sabine.example`])).rows[0];
      assert.ok(actor, 'Existing local sample account required');
      for (const [surface, projectId] of [['live', manifest.liveProjectId], ['history', manifest.historyProjectId]] as const) {
        const role = await getProjectRole(db, manifest.tenantId, projectId, actor.id, actor.session_version);
        const visibility = await resolveVisibility(db, manifest.tenantId, projectId, actor.id, role);
        const area = (await db.query(`SELECT aor_node_id FROM public.tickets WHERE tenant_id=$1 AND project_id=$2
          GROUP BY aor_node_id ORDER BY count(*) DESC LIMIT 1`, [manifest.tenantId, projectId])).rows[0].aor_node_id;
        const scope: MetricsScope = { tenantId: manifest.tenantId, projectId, visibility, today: '2026-09-30', includeCharts: true };
        for (const [population, filters] of [['all', {}], ['open', { population: 'open' }],
          ['area-completed', { areaId: area, status: 'COMPLETED' }], ['empty', { dateFrom: '2030-01-01' }]] as const) {
          await compare(db, `${account}-${surface}-${population}`, { ...scope, filters }, account === 'manager'); comparisons++;
        }
      }
    }
    assert.deepEqual(await fingerprint(), before, 'Public request state changed');
    await db.query('ROLLBACK');

    await db.query('BEGIN'); await db.query("SET LOCAL statement_timeout='10s'");
    await db.query(`CREATE TEMP TABLE tickets (
      id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,aor_node_id uuid,
      department_id uuid,company_id uuid,requester_id uuid,assigned_party_chief_id uuid,assigned_instrument_man_id uuid,
      status text,requested_date date,completed_at timestamptz,first_submitted_at timestamptz,submitted_at timestamptz,ticket_type text,draft_deleted_at timestamptz
    ) ON COMMIT DROP;
      CREATE TEMP TABLE aor_nodes (id uuid,tenant_id uuid,project_id uuid,name text) ON COMMIT DROP;
      CREATE TEMP TABLE users (id uuid,tenant_id uuid,name text) ON COMMIT DROP;
      CREATE TEMP TABLE ticket_events (ticket_id uuid,tenant_id uuid,payload jsonb) ON COMMIT DROP;
      SET LOCAL search_path=pg_temp;`);
    await db.query(`INSERT INTO pg_temp.tickets
      SELECT ('30000000-0000-4000-8000-'||lpad((n+1000)::text,12,'0'))::uuid,$1,$2,
        CASE WHEN n<=84 THEN $3::uuid ELSE $4::uuid END,NULL,$5,
        CASE WHEN n%2=0 THEN $6::uuid ELSE $7::uuid END,
        CASE WHEN n<=42 THEN $8::uuid ELSE $9::uuid END,$10,'COMPLETED',
        '2026-01-02','2026-01-03','2026-01-01','2026-01-01','LAYOUT',NULL FROM generate_series(1,50000) n`,
    [id(1),id(2),id(5),id(6),id(7),id(8),id(9),id(10),id(11),id(12)]);
    await db.query(`INSERT INTO pg_temp.aor_nodes VALUES ($1,$3,$4,'Area A'),($2,$3,$4,'Area B')`,
      [id(5),id(6),id(1),id(2)]);
    await db.query(`INSERT INTO pg_temp.users VALUES ($1,$4,'Chief A'),($2,$4,'Chief B'),($3,$4,'Instrument Man')`,
      [id(10),id(11),id(12),id(1)]);
    await db.query(`INSERT INTO pg_temp.ticket_events
      SELECT id,tenant_id,jsonb_build_object('importSnapshot',true,'completionDateGenerated',
        right(id::text,12)::bigint%10=0) FROM pg_temp.tickets;
      INSERT INTO pg_temp.ticket_events SELECT id,tenant_id,'{"importSnapshot":true,"completionDateGenerated":false}'::jsonb
        FROM pg_temp.tickets WHERE right(id::text,12)::bigint%10=0;
      INSERT INTO pg_temp.ticket_events SELECT id,tenant_id,'{"importSnapshot":false,"completionDateGenerated":true}'::jsonb FROM pg_temp.tickets;
      ANALYZE pg_temp.tickets; ANALYZE pg_temp.ticket_events; ANALYZE pg_temp.aor_nodes; ANALYZE pg_temp.users;`);
    const scope: MetricsScope = { tenantId: id(1), projectId: id(2), includeCharts: true, today: '2026-09-30',
      visibility: { projectId: id(2),actorId: id(8),actorRole: 'SURVEY_MANAGER',companyId: id(7),companyType: 'GC' } };
    const full = await compare(db, 'synthetic-50000', scope, true); comparisons++;
    assert.equal(full.total,50000); assert.equal(full.coverage!.imported,50000);
    assert.equal(full.coverage!.syntheticCompletions,5000); assert.equal(full.coverage!.cycleSamples,45000);
    assert.equal(full.averageSubmissionToCompletionHours,48);
    const small = await compare(db, 'synthetic-area84', { ...scope,filters: { areaId: id(5) } },true); comparisons++;
    assert.equal(small.total,84); assert.equal(small.coverage!.syntheticCompletions,8);
    const linkedScope: MetricsScope = { ...scope, visibility: { ...scope.visibility,actorRole: 'SURVEY_SUPERINTENDENT',
      aorNodeIds: [id(5),id(6)],linkedCrewAssignments: [{ areaId: id(5),partyChiefId: id(10) }] },filters: { cohort: 'linkedCrews' } };
    const linked = await compare(db, 'synthetic-linked42', linkedScope); comparisons++;
    assert.equal(linked.total,42); assert.equal(linked.coverage!.imported,42); assert.equal(linked.coverage!.syntheticCompletions,4);
    assert.equal(linked.coverage!.cycleSamples,38);
    const own = await compare(db,'synthetic-own',{ ...scope,visibility: { ...scope.visibility,actorRole:'REQUESTER' } }); comparisons++;
    assert.equal(own.total,25000); assert.equal(own.coverage!.syntheticCompletions,5000); assert.equal(own.coverage!.cycleSamples,20000);
    await db.query('ROLLBACK');
    console.log(JSON.stringify({ comparisons,syntheticRequests:50000,publicRecordsChanged:false,temporaryFixturesRolledBack:true }));
  } finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
}
main().catch(error => { console.error(JSON.stringify({ failed:true,type:error.constructor.name,code:error.code ?? null })); process.exitCode=1; });
