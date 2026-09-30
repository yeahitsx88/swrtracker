// Explicit opt-in for the owner's Area-delegated Sabine review decision.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pool } from 'pg';

if (process.env.SWR_GRANT_SABINE_REVIEW !== '1') throw new Error('SWR_GRANT_SABINE_REVIEW=1 is required');
const config = JSON.parse(fs.readFileSync('.data/sabine/runtime.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('.data/sabine/manifest.json', 'utf8'));
const url = new URL(config.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '15488');
assert.equal(url.pathname, '/swr_sabine_simulation');
const pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 10000 });
const db = await pool.connect();
try {
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock($1)', [260929021]);
  const { rows: admins } = await db.query(`SELECT u.id FROM users u JOIN project_memberships pm ON pm.user_id=u.id
    WHERE u.tenant_id=$1 AND pm.project_id=$2 AND pm.role='PROJECT_ADMIN' AND u.email='admin@sabine.example' AND u.deactivated_at IS NULL`, [manifest.tenantId, manifest.liveProjectId]);
  assert.equal(admins.length, 1);
  const { rows: coverage } = await db.query(`SELECT DISTINCT u.id, u.email, aa.aor_node_id FROM users u
    JOIN project_memberships pm ON pm.user_id=u.id
    JOIN aor_assignments aa ON aa.user_id=u.id AND aa.tenant_id=u.tenant_id AND aa.project_id=pm.project_id
    WHERE u.tenant_id=$1 AND pm.project_id=$2 AND pm.role='SURVEY_SUPERINTENDENT'
      AND u.email = ANY($3::text[]) AND u.deactivated_at IS NULL AND aa.deactivated_at IS NULL`,
    [manifest.tenantId, manifest.liveProjectId, [1,2,3,4,5].map(n=>`super${n}@sabine.example`)]);
  assert.equal(new Set(coverage.map(r=>r.id)).size, 5, 'All five Superintendents need explicit existing Area coverage');
  let created = 0;
  for (const row of coverage) {
    const { rows: prior } = await db.query(`SELECT id, revoked_at FROM project_responsibility_grants
      WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3 AND aor_node_id=$4 AND responsibility='SURVEY_REVIEWER'`,
      [manifest.tenantId, manifest.liveProjectId, row.id, row.aor_node_id]);
    if (prior.some(g=>g.revoked_at === null)) continue;
    assert.equal(prior.length, 0, 'A prior grant was revoked; refusing to silently re-grant it');
    const { rows: inserted } = await db.query(`INSERT INTO project_responsibility_grants
      (tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by)
      VALUES ($1,$2,$3,$4,'SURVEY_REVIEWER',$5) RETURNING id`,
      [manifest.tenantId, manifest.liveProjectId, row.id, row.aor_node_id, admins[0].id]);
    await db.query(`INSERT INTO access_grant_events (tenant_id,project_id,subject_user_id,actor_id,action,grant_id)
      VALUES ($1,$2,$3,$4,'RESPONSIBILITY_GRANTED',$5)`,
      [manifest.tenantId, manifest.liveProjectId, row.id, admins[0].id, inserted[0].id]);
    created++;
  }
  await db.query('COMMIT');
  console.log(JSON.stringify({ result: 'passed', superintendents: 5, areaGrants: coverage.length, created, historicalProjectChanged: false }));
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  db.release();
  await pool.end();
}
