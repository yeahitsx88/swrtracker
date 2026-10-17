// Opt-in, isolated Linux HTTP acceptance. Never reads Sabine credentials or data.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

if (process.env.SWR_LINUX_HTTP_SMOKE !== '1') throw new Error('SWR_LINUX_HTTP_SMOKE=1 is required');
const runId = `swr-http-${randomUUID().slice(0, 8)}`;
const db = `${runId}-db`, web = `${runId}-web`, network = `${runId}-network`;
const label = 'swrtracker.validation=linux-http';
const image = 'swrtracker:sabine-linux', checksImage = 'swrtracker:sabine-checks';
const base = 'http://127.0.0.1:3107';
const tenantId = '10000000-0000-4000-8000-000000000001';
const projectId = '10000000-0000-4000-8000-000000000002';
const env = { ...process.env, POSTGRES_PASSWORD: randomBytes(32).toString('hex'), JWT_SECRET: randomBytes(64).toString('hex') };
env.DATABASE_URL = `postgresql://postgres:${env.POSTGRES_PASSWORD}@${db}:5432/swr_http_acceptance`;
env.SWR_ATTACHMENT_ROOT = '/var/lib/swr/attachments';
const started = [];
function docker(args) {
  const result = spawnSync('docker', args, { env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  // Never echo command environment or raw Docker output that could contain credentials.
  if (result.status !== 0) throw new Error(`Docker ${args[0]} failed (exit ${result.status ?? 'unavailable'})`);
  return result.stdout.trim();
}
async function request(path, cookie, method = 'GET', body, key = randomUUID()) {
  return fetch(`${base}${path}`, {
    method, headers: { ...(cookie ? { cookie } : {}), ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }), 'idempotency-key': key },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
}
async function json(path, cookie, method, body, status = 200, key) {
  const response = await request(path, cookie, method, body, key);
  assert.equal(response.status, status, `${method ?? 'GET'} ${path}`);
  return response.json();
}
async function login(email) {
  const response = await request('/api/auth/login', null, 'POST', { tenantId, email, password: 'AmeliaBeta!2026' });
  assert.equal(response.status, 200, `Login ${email}`);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie.split(';')[0];
}
function upload(purpose) {
  const form = new FormData();
  form.set('file', new File(['synthetic instruction bytes'], 'instructions.txt', { type: 'text/plain' }));
  form.set('purpose', purpose);
  return form;
}
function sql(query) {
  return docker(['exec', db, 'psql', '-U', 'postgres', '-d', 'swr_http_acceptance', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query]);
}

try {
  for (const tag of [image, checksImage, 'postgres:15-alpine']) docker(['image', 'inspect', tag, '--format', '{{.Id}}']);
  docker(['network', 'create', '--label', label, network]);
  for (const suffix of ['postgres', 'attachments']) docker(['volume', 'create', '--label', label, `${runId}-${suffix}`]);
  docker(['run', '-d', '--pull=never', '--name', db, '--label', label, '--network', network,
    '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=swr_http_acceptance',
    '-v', `${runId}-postgres:/var/lib/postgresql/data`, 'postgres:15-alpine']);
  started.push(db);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    // The image's temporary initialization server uses a Unix socket only.
    // Wait for TCP so migrations cannot race that server's shutdown.
    const probe = spawnSync('docker', ['exec', db, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'swr_http_acceptance'], { stdio: 'ignore', timeout: 5000 });
    if (probe.status === 0) { ready = true; break; }
    await delay(250);
  }
  assert.ok(ready, 'Isolated database readiness');
  assert.equal(sql('SELECT current_database()'), 'swr_http_acceptance');
  for (const script of ['db/migrate.ts', 'scripts/seed-amelia-beta.ts']) {
    docker(['run', '--rm', '--pull=never', '--network', network, '-e', 'DATABASE_URL', checksImage, 'node', '--import', 'tsx', script]);
  }
  docker(['run', '-d', '--pull=never', '--name', web, '--label', label, '--network', network,
    '-p', '127.0.0.1:3107:3000', '-e', 'DATABASE_URL', '-e', 'JWT_SECRET', '-e', 'SWR_ATTACHMENT_ROOT',
    '-v', `${runId}-attachments:/var/lib/swr/attachments`, image]);
  started.push(web);
  ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await request('/login')).status === 200) { ready = true; break; } }
    catch (error) { if (attempt === 39) throw error; }
    await delay(250);
  }
  assert.ok(ready, 'Isolated web readiness');
  const requester = await login('requester@amelia.local');
  const authority = await login('authority@amelia.local');
  const lead = await login('lead@amelia.local');
  const instrument = await login('instrument@amelia.local');
  const superintendentId = randomUUID();
  const grantId = randomUUID();
  sql(`BEGIN;
    INSERT INTO users (id,tenant_id,company_id,email,password_hash,name,auth_method)
    SELECT '${superintendentId}',tenant_id,company_id,'superintendent@amelia.local',password_hash,'Area Superintendent','LOCAL'
    FROM users WHERE tenant_id='${tenantId}' AND email='lead@amelia.local';
    INSERT INTO project_memberships (project_id,user_id,role) VALUES ('${projectId}','${superintendentId}','SURVEY_SUPERINTENDENT');
    INSERT INTO aor_assignments (tenant_id,project_id,user_id,aor_node_id) VALUES ('${tenantId}','${projectId}','${superintendentId}','10000000-0000-4000-8000-000000000021');
    INSERT INTO project_responsibility_grants (id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by)
    VALUES ('${grantId}','${tenantId}','${projectId}','${superintendentId}','10000000-0000-4000-8000-000000000021','SURVEY_REVIEWER','10000000-0000-4000-8000-000000000010');
    INSERT INTO access_grant_events (tenant_id,project_id,subject_user_id,actor_id,action,grant_id)
    VALUES ('${tenantId}','${projectId}','${superintendentId}','10000000-0000-4000-8000-000000000010','RESPONSIBILITY_GRANTED','${grantId}');
    COMMIT;`);
  const superintendent = await login('superintendent@amelia.local');
  const payload = { projectId, aorNodeId: '10000000-0000-4000-8000-000000000021', departmentId: '10000000-0000-4000-8000-000000000023',
    ticketType: 'LAYOUT', fieldContact: 'Synthetic contact', requestedDate: new Date(Date.now() + 7 * 86400000).toISOString(), description: 'Isolated HTTP lifecycle' };
  const createKey = randomUUID();
  const created = await json('/api/tickets', requester, 'POST', payload, 201, createKey);
  const repeated = await json('/api/tickets', requester, 'POST', payload, 201, createKey);
  assert.equal(repeated.ticket.id, created.ticket.id);
  await json('/api/tickets', requester, 'POST', { ...payload, description: 'Changed retry' }, 409, createKey);
  const id = created.ticket.id;
  assert.match(id, /^[a-f0-9-]{36}$/);
  const path = `/api/tickets/${id}`;
  assert.equal(created.ticket.status, 'DRAFT');
  assert.equal(created.ticket.ticketNumber, null);
  const attachment = await json(`${path}/attachments`, requester, 'POST', upload('REQUEST_INSTRUCTION'), 201);
  assert.equal(attachment.attachment.storageKey, undefined);
  assert.equal(attachment.attachment.returnCycle, 0);
  await json(path, authority, 'PATCH', { description: 'Not the owner' }, 403);
  const submitted = await json(`${path}/submit`, requester, 'POST', {});
  assert.equal(submitted.ticket.status, 'SUBMITTED');
  assert.ok(submitted.ticket.ticketNumber);
  await json(`${path}/attachments`, requester, 'POST', upload('REQUEST_INSTRUCTION'), 409);
  await json(`${path}/approve`, requester, 'POST', {}, 403);
  const returned = await json(`${path}/return`, superintendent, 'POST', { reason: 'Synthetic correction required' });
  assert.equal(returned.ticket.status, 'RETURNED_FOR_CORRECTION');
  await json(path, requester, 'PATCH', { description: 'Corrected instructions' });
  const resubmitted = await json(`${path}/submit`, requester, 'POST', {});
  assert.equal(resubmitted.ticket.id, id);
  assert.equal(resubmitted.ticket.ticketNumber, submitted.ticket.ticketNumber);
  assert.ok(submitted.ticket.firstSubmittedAt);
  assert.equal(resubmitted.ticket.firstSubmittedAt, submitted.ticket.firstSubmittedAt);
  assert.ok(new Date(resubmitted.ticket.submittedAt) >= new Date(submitted.ticket.submittedAt));
  assert.equal(resubmitted.ticket.returnCycle, 1);
  const approvalKey = randomUUID();
  await json(`${path}/approve`, superintendent, 'POST', {}, 200, approvalKey);
  await json(`${path}/approve`, superintendent, 'POST', {}, 200, approvalKey);
  assert.equal(sql(`SELECT payload->'reviewAuthority'->>'grantId' FROM ticket_events WHERE tenant_id='${tenantId}' AND ticket_id='${id}' AND event_type='ticket.approved'`), grantId);
  const southTicket = sql(`SELECT id FROM tickets WHERE tenant_id='${tenantId}' AND project_id='${projectId}' AND aor_node_id='10000000-0000-4000-8000-000000000022' LIMIT 1`);
  await json(`/api/tickets/${southTicket}/approve`, superintendent, 'POST', {}, 404);
  sql(`BEGIN;
    UPDATE project_responsibility_grants SET revoked_at=NOW(),revoked_by='10000000-0000-4000-8000-000000000010' WHERE tenant_id='${tenantId}' AND id='${grantId}';
    INSERT INTO access_grant_events (tenant_id,project_id,subject_user_id,actor_id,action,grant_id)
    VALUES ('${tenantId}','${projectId}','${superintendentId}','10000000-0000-4000-8000-000000000010','RESPONSIBILITY_REVOKED','${grantId}');
    COMMIT;`);
  await json(`${path}/approve`, superintendent, 'POST', {}, 403);
  assert.equal(sql(`SELECT payload->'reviewAuthority'->>'grantId' FROM ticket_events WHERE tenant_id='${tenantId}' AND ticket_id='${id}' AND event_type='ticket.approved'`), grantId);
  await json(`${path}/assign`, lead, 'POST', { assignedPartyChiefId: null, assignedInstrumentManId: '10000000-0000-4000-8000-000000000013' });
  await json(`${path}/start`, instrument, 'POST', {});
  await json(`${path}/attachments`, instrument, 'POST', upload('FIELD_SUPPORT'), 201);
  const completed = await json(`${path}/complete`, instrument, 'POST', {});
  assert.equal(completed.ticket.status, 'COMPLETED');
  await json(`${path}/attachments`, instrument, 'POST', upload('FIELD_SUPPORT'), 409);
  const download = await request(attachment.attachment.downloadUrl, requester);
  assert.equal(download.status, 200);
  assert.equal(await download.text(), 'synthetic instruction bytes');
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  const events = JSON.parse(sql(`SELECT json_agg(event_type ORDER BY created_at, id) FROM ticket_events WHERE tenant_id='${tenantId}' AND ticket_id='${id}'`));
  for (const event of ['ticket.submitted', 'ticket.resubmitted', 'ticket.approved', 'ticket.assigned', 'ticket.in_progress', 'ticket.completed', 'attachment.downloaded']) {
    assert.equal(events.filter(value => value === event).length, 1, event);
  }
  assert.equal(events.filter(value => value === 'attachment.uploaded').length, 2);
  assert.equal(sql(`SELECT count(*) FROM attachments WHERE tenant_id='${tenantId}' AND ticket_id='${id}'`), '2');
  const files = docker(['exec', web, 'node', '-e', "const fs=require('node:fs');const root='/var/lib/swr/attachments';console.log(fs.readdirSync(root,{recursive:true,withFileTypes:true}).filter(x=>x.isFile()).length)"]);
  assert.equal(files, '2', 'Rejected uploads must not leave orphan files');
  console.log(JSON.stringify({ result: 'passed', runId, ticketId: id, checks: ['create replay and mismatch', 'owner-only correction', 'same-record resubmission', 'approval replay', 'direct completion', 'revision-bound uploads', 'sealed attachment rejection', 'download bytes', 'audit counts', 'no orphan upload bytes'] }));
} finally {
  for (const name of started.reverse()) {
    assert.equal(docker(['inspect', name, '--format', '{{index .Config.Labels "swrtracker.validation"}}']), 'linux-http');
    docker(['stop', name]);
  }
  console.log(`Stopped only this run's test containers. Retained labeled containers, network and volumes for inspection: ${runId}`);
}
