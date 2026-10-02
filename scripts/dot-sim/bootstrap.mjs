// Only this process can bootstrap identities. Actors never import this module.
import fs from 'node:fs';
import {Pool} from 'pg';
import bcrypt from 'bcrypt';
import {assertDatabaseTarget,assertDatabaseMarker,validateRuntime,validatePopulation,names} from './policy.mjs';

assertDatabaseTarget(process.env.DATABASE_URL, process.env.SWR_DOT_BOOTSTRAP);
const config = validateRuntime(JSON.parse(fs.readFileSync('/run/dot/runtime.json','utf8')));
const population = validatePopulation(JSON.parse(fs.readFileSync('/run/dot/credentials.json','utf8')),config);
const url = new URL(process.env.DATABASE_URL);
if (url.password !== config.dbPassword) throw new Error('Dot database credential identity mismatch');
const pool = new Pool({connectionString:url.toString()});
const db = await pool.connect();
const mode = process.argv[2];
try {
  await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(261002118)');
  if ((await db.query('SELECT current_database() AS name')).rows[0].name !== names.database) throw new Error('Dot database identity mismatch');
  const table = (await db.query("SELECT to_regclass('public._dot_sim_runtime') AS name")).rows[0].name;
  if (!table) {
    if (mode !== 'claim') throw new Error('Unclaimed dot database');
    const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
    if (tables.length) throw new Error('Refusing nonempty unowned database');
    await db.query('CREATE TABLE _dot_sim_runtime(owner_id UUID PRIMARY KEY,kind TEXT NOT NULL,version INTEGER NOT NULL,seeded BOOLEAN NOT NULL DEFAULT false,tenant_id UUID NOT NULL)');
    await db.query("INSERT INTO _dot_sim_runtime(owner_id,kind,version,tenant_id) VALUES($1,'dot-sim',1,$2)",[config.ownerId,config.tenantId]);
  }
  const markers = (await db.query('SELECT * FROM _dot_sim_runtime FOR UPDATE')).rows;
  assertDatabaseMarker(markers,config);
  if (mode === 'seed' && !markers[0].seeded) {
    for (const name of ['tenants','users','projects','tickets']) {
      if ((await db.query(`SELECT 1 FROM ${name} LIMIT 1`)).rows.length) throw new Error('Refusing preexisting application data');
    }
    await db.query('INSERT INTO tenants(id,name) VALUES($1,$2),($3,$4)',[config.tenantId,'DOT SIM Synthetic Tenant',config.controlTenantId,'DOT SIM Tenant Isolation Control']);
    for (const c of population.companies) await db.query('INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,$3,$4)',[c.id,c.tenantId,c.name,c.type]);
    for (const a of population.actors) {
      if (a.key === 'sub-requester') continue; // Existing bound invite/registration can create this identity normally.
      const hash = await bcrypt.hash(a.password,12);
      await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash,auth_method) VALUES($1,$2,$3,$4,$5,$6,'LOCAL')",[a.id,a.tenantId,a.companyId,a.email,a.name,hash]);
      if (['central-it','foreign-control'].includes(a.key)) await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[a.tenantId,a.id]);
    }
    const disabled = population.actors.find(a=>a.key==='disabled-control');
    const root = population.actors.find(a=>a.key==='central-it');
    await db.query('UPDATE users SET deactivated_at=NOW(),deactivated_by=$2 WHERE id=$1',[disabled.id,root.id]);
    await db.query('UPDATE _dot_sim_runtime SET seeded=true');
  }
  if (!['claim','seed','verify','evidence'].includes(mode)) throw new Error('Unknown dot bootstrap mode');
  if (mode === 'verify' && !markers[0].seeded) throw new Error('Dot bootstrap not complete');
  if (mode === 'evidence') {
    // Orchestration evidence is read-only; authoritative records remain in application tables.
    const result = {
      tenantRoleHolders:(await db.query('SELECT tenant_id,user_id,role FROM tenant_memberships ORDER BY tenant_id,user_id')).rows,
      adminGrants:(await db.query('SELECT tenant_id,project_id,user_id,revoked_at FROM project_admin_grants ORDER BY project_id,user_id')).rows,
      workflow:(await db.query(`SELECT t.id,t.project_id,t.status,t.requester_id,t.assigned_instrument_man_id,
        (SELECT json_agg(json_build_object('type',event_type,'actorId',actor_id) ORDER BY created_at,id) FROM ticket_events e WHERE e.tenant_id=t.tenant_id AND e.ticket_id=t.id) AS events
        FROM tickets t ORDER BY t.id`)).rows,
      administrativeEvents:(await db.query('SELECT event_type,actor_id,project_id,subject_user_id FROM administrative_events ORDER BY occurred_at,id')).rows,
      staffingEvents:(await db.query('SELECT event_type,actor_id,project_id FROM survey_staffing_events ORDER BY created_at,id')).rows,
      totalAccountCount:(await db.query('SELECT count(*)::integer AS count FROM users')).rows[0].count,
    };
    console.log(JSON.stringify(result));
  }
  await db.query('COMMIT');
} catch {
  await db.query('ROLLBACK');
  // Database diagnostics may contain submitted secrets. Emit only a fixed failure.
  throw new Error('Dot bootstrap/ownership/evidence check failed; no bootstrap transaction committed');
} finally { db.release(); await pool.end(); }
