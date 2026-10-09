import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { signToken, requireActiveAuth } from '../../src/lib/auth';
import { NextRequest } from 'next/server';
import { getProjectRole } from '../../src/lib/get-project-role';
import { handleGetSurveyOrganization } from '../../src/app/api/projects/[projectId]/survey/organization/handler';
import { SurveyTeamsPgRepository } from '../../src/modules/tenancy/infrastructure/survey-teams.repository';
import { SurveyStaffingPgRepository } from '../../src/modules/tenancy/infrastructure/survey-staffing.repository';
import { SuperintendentAreasPgRepository } from '../../src/modules/tenancy/infrastructure/superintendent-areas.repository';
import type { SurveyOrganization } from '../../src/modules/tenancy/application/read-survey-organization';

const fixturePath = resolve('.local/org-read/fixture.json');
const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.SWR_ORG_READ_ACCEPTANCE !== '1' || url.hostname !== '127.0.0.1' || url.port !== '15496' || url.pathname !== '/swr_org_read_20261006') throw new Error('Use the newly owned Org Chart read-only fixture at loopback15496/swr_org_read_20261006');
const pool = new Pool({ connectionString: url.href, max: 2 });
type Fixture = { tenant: string; foreignTenant: string; project: string; otherProject: string; foreignProject: string; mediumProject: string; slimProject: string; people: Record<string, string>; areas: string[]; tokens: Record<string, string>; mediumToken: string; slimToken: string; ownership: string };
const protectedTables = ['tenants', 'companies', 'projects', 'users', 'project_memberships', 'aor_levels', 'aor_nodes', 'aor_assignments', 'survey_reporting_links', 'crew_rosters', 'survey_teams', 'survey_team_members', 'survey_team_areas', 'survey_staffing_events', 'tickets', 'ticket_events', 'administrative_events'];
async function witness() {
  const contents = [];
  for (const table of protectedTables) contents.push((await pool.query(`SELECT row_to_json(t) AS value FROM ${table} t ORDER BY row_to_json(t)::text`)).rows);
  return createHash('sha256').update(JSON.stringify(contents)).digest('hex');
}
async function setup() {
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].count, 0, 'Setup refuses any existing public table; no retained data resets');
  const db = await pool.connect();
  const tenant = randomUUID(), foreignTenant = randomUUID(), company = randomUUID(), foreignCompany = randomUUID();
  const project = randomUUID(), otherProject = randomUUID(), foreignProject = randomUUID(), mediumProject = randomUUID(), slimProject = randomUUID();
  const roles: Record<string, string> = { manager: 'SURVEY_MANAGER', superintendent: 'SURVEY_SUPERINTENDENT', secondSuperintendent: 'SURVEY_SUPERINTENDENT', chief: 'PARTY_CHIEF', secondChief: 'PARTY_CHIEF', retainedChief: 'PARTY_CHIEF', unlinkedChief: 'PARTY_CHIEF', instrument: 'INSTRUMENT_MAN', secondInstrument: 'INSTRUMENT_MAN', unlinkedInstrument: 'INSTRUMENT_MAN', retainedInstrument: 'REQUESTER', formerSuperintendent: 'REQUESTER', requester: 'REQUESTER', viewer: 'VIEWER', admin: 'PROJECT_ADMIN', otherManager: 'SURVEY_MANAGER', foreignManager: 'SURVEY_MANAGER' };
  const people = Object.fromEntries(Object.keys(roles).map(name => [name, randomUUID()]));
  const areas = [randomUUID(), randomUUID(), randomUUID()];
  try {
    await db.query('BEGIN');
    for (const file of (await readdir(resolve('db/migrations'))).filter(name => name.endsWith('.sql')).sort()) await db.query(await readFile(resolve('db/migrations', file), 'utf8'));
    await db.query("INSERT INTO tenants(id,name) VALUES($1,'Owned Org Chart Read Fixture'),($2,'Foreign Org Chart Fixture')", [tenant, foreignTenant]);
    await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned GC','GC'),($3,$4,'Foreign GC','GC')", [company, tenant, foreignCompany, foreignTenant]);
    for (const [id, scope, name, build] of [[project, tenant, 'Read-only Hierarchy Fixture', 'FULL'], [otherProject, tenant, 'Separate Project', 'FULL'], [foreignProject, foreignTenant, 'Foreign Project', 'FULL'], [mediumProject, tenant, 'Medium Fixture', 'MEDIUM'], [slimProject, tenant, 'Slim Fixture', 'SLIM']]) await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,$3,'ACTIVE',$4)", [id, scope, name, build]);
    for (const [key, role] of Object.entries(roles)) {
      const foreign = key === 'foreignManager';
      await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'fixture-only-no-password-login')", [people[key], foreign ? foreignTenant : tenant, foreign ? foreignCompany : company, `${key}@org-fixture.invalid`, key === 'chief' ? 'Live Chief A' : key === 'instrument' ? 'Live Instrument A' : key === 'superintendent' ? 'Live Superintendent A' : `Live ${key}`]);
      await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)', [foreign ? foreignProject : key === 'otherManager' ? otherProject : project, people[key], role]);
    }
    await db.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,granted_by,origin) VALUES($1,$2,$3,$4,'EXPLICIT')", [tenant, project, people.admin, people.manager]);
    await db.query('UPDATE users SET deactivated_at=now(),deactivated_by=id WHERE id=$1', [people.formerSuperintendent]);
    const level = randomUUID();
    await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')", [level, tenant, project]);
    for (const [index, area] of areas.entries()) await db.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$6)', [area, tenant, project, level, ['Reporting North', 'Individual South', 'Team West'][index], `ORG${index}`]);
    for (const [key, assignments] of [['superintendent', [areas[0], areas[1]]], ['secondSuperintendent', [areas[1], areas[2]]], ['chief', [areas[0], areas[1]]], ['secondChief', [areas[1]]], ['retainedChief', [areas[0]]]] as const) for (const area of assignments) await db.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)', [tenant, project, people[key], area]);
    for (const [sup, chief, area] of [['superintendent', 'chief', areas[0]], ['secondSuperintendent', 'secondChief', areas[1]], ['formerSuperintendent', 'retainedChief', areas[0]]]) await db.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)', [tenant, project, people[sup!], people[chief!], area, people.manager]);
    for (const [chief, instrument] of [['chief', 'instrument'], ['chief', 'retainedInstrument'], ['secondChief', 'secondInstrument']]) await db.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)', [tenant, project, people[chief!], people[instrument!]]);
    for (const [name, lead, members, coverage] of [['Blue Named Team', 'secondSuperintendent', ['secondSuperintendent', 'chief', 'instrument'], [areas[1], areas[2]]], ['Red Named Team', 'superintendent', ['superintendent', 'secondChief', 'secondInstrument', 'unlinkedInstrument'], [areas[0]]]] as const) {
      const teamId = randomUUID();
      await db.query('INSERT INTO survey_teams(id,tenant_id,project_id,name,aor_node_id,lead_user_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [teamId, tenant, project, name, coverage[0], people[lead], people.manager]);
      for (const member of members) await db.query('INSERT INTO survey_team_members(tenant_id,project_id,team_id,user_id) VALUES($1,$2,$3,$4)', [tenant, project, teamId, people[member]]);
      for (const area of coverage) await db.query('INSERT INTO survey_team_areas(tenant_id,project_id,team_id,area_id) VALUES($1,$2,$3,$4)', [tenant, project, teamId, area]);
    }
    // More than one personnel page, wholly separate from the browser project.
    for (let index = 0; index < 101; index++) {
      const member = randomUUID();
      await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'fixture-only')", [member, tenant, company, `page${index}@org-fixture.invalid`, `Other Project IM ${index}`]);
      await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'INSTRUMENT_MAN')", [otherProject, member]);
    }
    for (const p of [mediumProject, slimProject]) await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_MANAGER')", [p, people.manager]);
    await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'INSTRUMENT_MAN'),($1,$3,'PARTY_CHIEF')", [mediumProject, people.instrument, people.chief]);
    await db.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)', [tenant, mediumProject, people.chief, people.instrument]);
    await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'INSTRUMENT_MAN')", [slimProject, people.instrument]);
    const ticket = randomUUID();
    await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT','Survey','Org Chart retained witness')", [ticket, tenant, project, company, people.requester]);
    await db.query("INSERT INTO ticket_events(ticket_id,tenant_id,actor_id,event_type,payload) VALUES($1,$2,$3,'ticket.created','{\"ownedReadWitness\":true}')", [ticket, tenant, people.requester]);
    await db.query('COMMIT');
    const fixture: Fixture = { tenant, foreignTenant, project, otherProject, foreignProject, mediumProject, slimProject, people, areas, tokens: Object.fromEntries(Object.entries(people).map(([key, user]) => [key, signToken(user as never, (key === 'foreignManager' ? foreignTenant : tenant) as never)])), mediumToken: signToken(people.manager! as never, tenant as never), slimToken: signToken(people.manager! as never, tenant as never), ownership: 'New empty swr_org_read_20261006 database in owned swr-org-read-db-20261006 container only' };
    await writeFile(fixturePath, JSON.stringify(fixture, null, 2));
    console.log('PASS fresh owned fixture initialized with current migrations; private tokens remain ignored');
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}

async function verify() {
  const origin = process.env.SWR_ORG_READ_ORIGIN;
  if (!origin || !/^http:\/\/127\.0\.0\.1:3171$/.test(origin)) throw new Error('Use owned Org Chart runtime3171');
  const f = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;
  assert.equal((await pool.query('SELECT name FROM tenants WHERE id=$1', [f.tenant])).rows[0]?.name, 'Owned Org Chart Read Fixture');
  const before = await witness();
  const checks: string[] = [];
  async function call(project: string, token: string, expected = 200, method = 'GET') {
    const response = await fetch(`${origin}/api/projects/${project}/survey/organization`, { method, headers: { cookie: `swr_session=${token}` } });
    assert.equal(response.status, expected);
    if (expected === 200) assert.equal(response.headers.get('cache-control'), 'private, no-store');
    checks.push(`${method} organization: ${expected}`);
    return expected === 200 ? await response.json() as SurveyOrganization : undefined;
  }
  const data = (await call(f.project, f.tokens.manager!))!;
  assert.equal(data.staffing.find(value => value.partyChiefId === f.people.chief)!.reporting!.superintendent.userId, f.people.superintendent);
  assert.equal(data.staffing.find(value => value.partyChiefId === f.people.chief)!.instrumentMen[0]!.userId, f.people.instrument);
  assert.deepEqual(data.staffing.find(value => value.partyChiefId === f.people.chief)!.areas.data.map(value => value.id).sort(), f.areas.slice(0, 2).sort());
  assert.equal(data.personnel.find(value => value.userId === f.people.chief)!.teamName, 'Blue Named Team');
  assert.equal(data.teams.find(value => value.name === 'Blue Named Team')!.lead.userId, f.people.secondSuperintendent);
  assert.deepEqual(data.teams.find(value => value.name === 'Blue Named Team')!.areas!.map(value => value.id).sort(), f.areas.slice(1).sort());
  assert.equal(data.staffing.find(value => value.partyChiefId === f.people.retainedChief)!.reporting!.superintendent.active, false);
  assert.equal(data.staffing.find(value => value.partyChiefId === f.people.chief)!.instrumentMen.find(value => value.userId === f.people.retainedInstrument)!.role, 'REQUESTER');
  checks.push('Live explicit reporting, complete crew links, distinct team leadership and multiple individual/team Areas; retained changed-role/inactive links');
  for (const key of ['superintendent', 'chief', 'instrument', 'requester', 'viewer', 'admin']) await call(f.project, f.tokens[key]!, 403);
  await call(f.otherProject, f.tokens.manager!, 403);
  await call(f.foreignProject, f.tokens.manager!, 403);
  await call(f.project, f.tokens.foreignManager!, 403);
  const other = (await call(f.otherProject, f.tokens.otherManager!))!;
  assert.equal(other.personnel.length, 102);
  assert.ok(other.personnel.every(value => !data.personnel.some(person => person.userId === value.userId)));
  const foreign = (await call(f.foreignProject, f.tokens.foreignManager!))!;
  assert.equal(foreign.personnel.length, 1);
  assert.ok(!JSON.stringify(foreign).includes(f.people.manager!));
  checks.push('Actual multi-page collection, cross-project and cross-tenant nondisclosure');
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) await call(f.project, f.tokens.manager!, 405, method);
  await call(f.project, signToken(f.people.manager! as never, f.tenant as never, 99), 401);
  const managerBefore = (await pool.query('SELECT * FROM project_memberships WHERE project_id=$1 AND user_id=$2', [f.project, f.people.manager])).rows[0];
  try {
    await pool.query('UPDATE project_memberships SET access_disabled_at=now(),access_disabled_by=$3 WHERE project_id=$1 AND user_id=$2', [f.project, f.people.manager, f.people.admin]);
    await call(f.project, f.tokens.manager!, 403);
  } finally { await pool.query('UPDATE project_memberships SET access_disabled_at=$3,access_disabled_by=$4 WHERE project_id=$1 AND user_id=$2', [f.project, f.people.manager, managerBefore.access_disabled_at, managerBefore.access_disabled_by]); }
  const active = (await pool.query('SELECT status FROM projects WHERE id=$1', [f.project])).rows[0].status;
  try { await pool.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1", [f.project]); assert.equal((await call(f.project, f.tokens.manager!))!.project.status, 'ARCHIVED'); }
  finally { await pool.query('UPDATE projects SET status=$2 WHERE id=$1', [f.project, active]); }
  assert.equal((await call(f.mediumProject, f.mediumToken))!.project.crewBuild, 'MEDIUM');
  assert.equal((await call(f.slimProject, f.slimToken))!.project.crewBuild, 'SLIM');
  // Change a team after personnel has been read. Later reads must use the same
  // repeatable database snapshot, rather than presenting a mixed hierarchy.
  const teamRecord = (await pool.query('SELECT id,name FROM survey_teams WHERE project_id=$1 ORDER BY name LIMIT 1', [f.project])).rows[0];
  const probeTeams = new SurveyTeamsPgRepository();
  const readPersonnel = probeTeams.personnel.bind(probeTeams);
  let changedDuringRead = false;
  probeTeams.personnel = async (db, tenant, project, query) => {
    const page = await readPersonnel(db, tenant, project, query);
    if (!changedDuringRead) {
      changedDuringRead = true;
      await pool.query('UPDATE survey_teams SET name=$2 WHERE id=$1', [teamRecord.id, 'Concurrent owned team change']);
    }
    return page;
  };
  try {
    const response = await handleGetSurveyOrganization(new NextRequest(`${origin}/api/projects/${f.project}/survey/organization`, { headers: { cookie: `swr_session=${f.tokens.manager}` } }),
      { params: Promise.resolve({ projectId: f.project }) }, {
        requireAuth: (req, db) => requireActiveAuth(req, db ?? pool), getProjectRole,
        withTransaction: async fn => { const db = await pool.connect(); try { await db.query('BEGIN'); const value = await fn(db); await db.query('COMMIT'); return value; } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); } },
        repos: { teams: probeTeams, staffing: new SurveyStaffingPgRepository(), superintendentAreas: new SuperintendentAreasPgRepository() },
      });
    assert.equal(response.status, 200);
    const snapshot = await response.json() as SurveyOrganization;
    assert.equal(snapshot.teams.find(value => value.id === teamRecord.id)!.name, teamRecord.name);
    assert.ok(snapshot.personnel.filter(value => value.teamId === teamRecord.id).every(value => value.teamName === teamRecord.name));
    checks.push('Actual separate-connection concurrent team change: entire aggregate retains one coherent read snapshot');
  } finally { await pool.query('UPDATE survey_teams SET name=$2 WHERE id=$1', [teamRecord.id, teamRecord.name]); }

  const after = await witness();
  assert.equal(after, before, 'Hierarchy reads/refused methods preserve staffing, roles, teams, Areas, tickets and history');
  checks.push('No hierarchy mutation; exact retained domain-table witness unchanged after authorization/archive probes');
  await writeFile(resolve('.local/org-read/http-evidence.json'), JSON.stringify({ checks, before, after, mode: 'Actual authenticated HTTP against newly owned current PostgreSQL fixture and production runtime' }, null, 2));
  console.log(`PASS ${checks.length} live HTTP/schema read-only checks; retained domain witness unchanged`);
}

async function main() {
  try { if (process.argv[2] === 'setup') await setup(); else if (process.argv[2] === 'verify') await verify(); else throw new Error('Use setup or verify'); }
  finally { await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Read-only acceptance failed'); process.exitCode = 1; });
