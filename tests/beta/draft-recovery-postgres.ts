// Actual routes over session-local schema clones. Uses the isolated 15489 database; never mutates retained public fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { getPool } from '../../src/lib/db';
import { signToken } from '../../src/lib/auth';
import { POST as save } from '../../src/app/api/projects/[projectId]/drafts/route';
import { GET as detail, PATCH as edit } from '../../src/app/api/tickets/[ticketId]/route';
import { POST as submit } from '../../src/app/api/tickets/[ticketId]/submit/route';
import { DELETE as remove } from '../../src/app/api/tickets/[ticketId]/draft/route';
import { POST as restore } from '../../src/app/api/projects/[projectId]/drafts/[ticketId]/restore/route';
import { GET as deleted } from '../../src/app/api/projects/[projectId]/deleted-drafts/route';
import { GET as list } from '../../src/app/api/tickets/route';
import { handlePostTicketAttachments } from '../../src/app/api/tickets/[ticketId]/attachments/handler';
import { getTicketRouteContext, withTicketMutation } from '../../src/lib/ticket-route-helpers';
import { TicketRepository } from '../../src/modules/ticket/infrastructure/ticket.repository';
import { AttachmentRepository, validateAttachmentObjectMetadata } from '../../src/modules/attachment/infrastructure';
import type { UUID } from '../../src/shared/types';

const id = (n: number) => `86000000-0000-4000-8000-${String(n).padStart(12, '0')}` as UUID;
const tenant = id(1), project = id(2), company = id(3), owner = id(4), admin = id(5), other = id(6), area = id(7);
async function main() {
  assert.equal(process.env.SWR_TEAM_POSTGRES, '1');
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '15489'); assert.equal(url.pathname, '/swr_team_isolated');
  process.env.JWT_SECRET ??= 'synthetic-draft-regression-only';
  const pg = new Pool({ connectionString: url.href, max: 1 }), db = await pg.connect();
  const app = getPool(), oldQuery = app.query, oldConnect = app.connect;
  const fingerprint = async () => (await db.query("SELECT count(*)::text AS n,md5(string_agg(id::text||':'||status::text||':'||row_version::text,',' ORDER BY id)) AS hash FROM public.tickets")).rows[0];
  const before = await fingerprint(); let checks = 0;
  const check = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); checks++; };
  try {
    await db.query('BEGIN');
    const tables = ['companies','projects','users','project_memberships','aor_levels','aor_nodes','aor_assignments','crew_rosters',
      'tickets','ticket_events','ticket_sequences','cad_work','ticket_assignment_history','departments','department_memberships',
      'department_titles','priority_whitelist','api_idempotency','attachments','revoked_auth_sessions',
      'ticket_return_cycles','ticket_need_by_revisions','notification_outbox','project_recommissioning'];
    tables.push('tenants','tenant_memberships','project_admin_grants','project_companies','project_responsibility_grants','company_authority_grants','acting_grants');
    const source=(await db.query('SELECT current_schema() AS name')).rows[0].name;
    assert.match(source,/^phase5_regression_[a-f0-9]{32}$/);
    for (const table of tables) await db.query(`CREATE TEMP TABLE ${table} (LIKE "${source}".${table} INCLUDING ALL) ON COMMIT DROP`);
    await db.query('SET LOCAL search_path=pg_temp');
    for (const table of tables) check((await db.query('SELECT to_regclass($1)::oid=to_regclass($2)::oid AS safe', [table, `pg_temp.${table}`])).rows[0].safe, true);
    // Validate the migration against a temporary copy of every incumbent request.
    await db.query('INSERT INTO pg_temp.tickets SELECT * FROM public.tickets');
    // ANALYZE need not create a column statistic for an empty relation. Supply
    // one owned incumbent so the migration check does not depend on public data.
    await db.query(`INSERT INTO pg_temp.tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description)
      VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT','Survey','Synthetic incumbent migration witness')`,
      [randomUUID(),tenant,project,company,owner]);
    const legacyFingerprint = async () => (await db.query(`SELECT count(*)::text AS n,
      md5(string_agg((to_jsonb(t)-'draft_deleted_at'-'draft_deleted_reason'-'draft_last_saved_at')::text,',' ORDER BY id)) AS hash FROM pg_temp.tickets t`)).rows[0];
    const legacyBefore = await legacyFingerprint();
    const migration = fs.readFileSync('db/migrations/029_partial_drafts_and_recovery.sql', 'utf8');
    await db.query(migration); await db.query(migration);
    check(await legacyFingerprint(), legacyBefore);
    check((await db.query(`SELECT count(*)::int AS n FROM pg_statistic
      WHERE starelid='pg_temp.tickets'::regclass AND staattnum=(SELECT attnum FROM pg_attribute
        WHERE attrelid='pg_temp.tickets'::regclass AND attname='draft_deleted_at')`)).rows[0].n,1);
    await db.query('TRUNCATE pg_temp.tickets'); // Only the verified session-local copy.
    app.query = db.query.bind(db) as typeof app.query;
    app.connect = (async () => ({ query: async (sql: string, values?: unknown[]) => {
      if (sql === 'BEGIN') return db.query('SAVEPOINT route_command');
      if (sql === 'COMMIT') return db.query('RELEASE SAVEPOINT route_command');
      if (sql === 'ROLLBACK') { await db.query('ROLLBACK TO SAVEPOINT route_command'); return db.query('RELEASE SAVEPOINT route_command'); }
      return db.query(sql, values);
    }, release: () => {} })) as unknown as typeof app.connect;
    await db.query("INSERT INTO tenants(id,name) VALUES($1,'Synthetic draft tenant')",[tenant]);
    await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Synthetic company','GC')", [company, tenant]);
    await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Synthetic draft project','ACTIVE','FULL')", [project, tenant]);
    for (const [user, role] of [[owner,'REQUESTER'],[admin,'PROJECT_ADMIN'],[other,'REQUESTER']] as const) {
      await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Synthetic person','not-a-login-hash')", [user, tenant, company, `${user}@example.invalid`]);
      await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)', [project,user,role]);
    }
    await db.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$3)",[tenant,project,admin]);
    await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Synthetic Area','SYN')", [area,tenant,project,id(8)]);
    const projectCtx = { params: Promise.resolve({ projectId: project }) };
    const request = (user: UUID, path: string, method = 'GET', body?: unknown, key = 'one') => new NextRequest(`http://localhost${path}`, {
      method, headers: { cookie: `swr_session=${signToken(user,tenant)}`, 'content-type':'application/json', 'idempotency-key':key },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const first = await save(request(owner, `/api/projects/${project}/drafts`, 'POST', {}, 'create'), projectCtx);
    check(first.status, 201); const draft = (await first.json()).ticket;
    check([draft.aorNodeId,draft.ticketType,draft.requestedDate,draft.ticketNumber], [null,null,null,null]);
    const ticketCtx = { params: Promise.resolve({ ticketId: draft.id }) }, ticketPath = `/api/tickets/${draft.id}`;
    check((await save(request(owner, `/api/projects/${project}/drafts`, 'POST', {}, 'create'), projectCtx)).status, 201);
    check((await db.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n, 1);
    check((await detail(request(other,ticketPath), ticketCtx)).status, 404);
    check((await submit(request(owner,`${ticketPath}/submit`,'POST', { expectedVersion:0 }, 'incomplete'),ticketCtx)).status, 400);
    check((await db.query('SELECT count(*)::int AS n FROM ticket_sequences')).rows[0].n, 0);
    const fields = { aorNodeId:area, ticketType:'TOPO', fieldContact:'Synthetic foreman', description:'Synthetic work', requestedDate:'2028-02-29', expectedVersion:0 };
    check((await edit(request(owner,ticketPath,'PATCH',fields,'fields'),ticketCtx)).status, 200);
    check((await edit(request(owner,ticketPath,'PATCH',fields,'fields'),ticketCtx)).status, 200);
    check((await edit(request(owner,ticketPath,'PATCH',{ description:'Stale',expectedVersion:0 },'stale'),ticketCtx)).status, 409);
    check((await remove(request(owner,`${ticketPath}/draft`,'DELETE',{ expectedVersion:0 },'stale-delete'),ticketCtx)).status, 409);
    const objects = new Map<string,Buffer>();
    const uploadDeps = { getTicketRouteContext, withTicketMutation,
      createTicketRepo: () => new TicketRepository(), createAttachmentRepo: () => new AttachmentRepository(),
      validateAttachmentMetadata: validateAttachmentObjectMetadata,
      createStorage: () => ({ write: async (_tenant:UUID,_ticket:UUID,bytes:Uint8Array) => {
        const storageKey = randomUUID(); objects.set(storageKey,Buffer.from(bytes));
        return { storageKey, contentSha256:createHash('sha256').update(bytes).digest('hex') };
      }, read: async (key:string) => { const bytes=objects.get(key); assert.ok(bytes); return bytes; },
      remove: async (key:string) => { objects.delete(key); } }),
    };
    const upload = async (bytes='Synthetic retained file') => {
      const form = new FormData(); form.set('file',new File([bytes],'synthetic.txt',{ type:'text/plain' })); form.set('purpose','REQUEST_INSTRUCTION');
      return handlePostTicketAttachments(new NextRequest(`http://localhost${ticketPath}/attachments`,{
        method:'POST',headers:{ cookie:`swr_session=${signToken(owner,tenant)}`,'idempotency-key':'upload-one' },body:form,
      }),ticketCtx,uploadDeps);
    };
    const uploaded=await upload(); check(uploaded.status,201); const file=(await uploaded.json()).attachment;
    check(file.storageKey,undefined); check((await upload()).status,201); check(objects.size,1);
    check((await upload('Changed file')).status,409); check(objects.size,1);
    check((await db.query('SELECT count(*)::int AS n FROM attachments')).rows[0].n,1);
    check((await remove(request(owner,`${ticketPath}/draft`,'DELETE',{ expectedVersion:1 },'delete'),ticketCtx)).status, 200);
    check((await remove(request(owner,`${ticketPath}/draft`,'DELETE',{ expectedVersion:1 },'delete'),ticketCtx)).status, 200);
    check((await detail(request(owner,ticketPath),ticketCtx)).status, 404);
    check((await edit(request(owner,ticketPath,'PATCH',fields,'fields'),ticketCtx)).status, 404);
    check((await save(request(owner, `/api/projects/${project}/drafts`, 'POST', {}, 'create'), projectCtx)).status, 404);
    const normal = await list(request(owner,`/api/tickets?projectId=${project}&status=DRAFT`)); check(normal.status,200); check((await normal.json()).total,0);
    check((await deleted(request(owner,`/api/projects/${project}/deleted-drafts`),projectCtx)).status,403);
    const recoverable = await deleted(request(admin,`/api/projects/${project}/deleted-drafts`),projectCtx); check(recoverable.status,200); check((await recoverable.json()).total,1);
    const restoreCtx = { params: Promise.resolve({ projectId:project, ticketId:draft.id }) }, restorePath = `/api/projects/${project}/drafts/${draft.id}/restore`;
    check((await upload()).status,404); check(objects.size,1);
    await db.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[project]);
    check((await restore(request(admin,restorePath,'POST',{ expectedVersion:2,reason:'Synthetic recovery' },'archived'),restoreCtx)).status,409);
    await db.query("UPDATE projects SET status='ACTIVE' WHERE id=$1",[project]);
    await db.query("UPDATE tickets SET draft_deleted_at=NOW()-INTERVAL '31 days' WHERE id=$1",[draft.id]);
    check((await restore(request(admin,restorePath,'POST',{ expectedVersion:2,reason:'Synthetic recovery' },'expired'),restoreCtx)).status,409);
    await db.query('UPDATE tickets SET draft_deleted_at=NOW() WHERE id=$1',[draft.id]);
    await db.query('UPDATE users SET deactivated_at=NOW(),deactivated_by=id WHERE id=$1',[owner]);
    check((await restore(request(admin,restorePath,'POST',{ expectedVersion:2,reason:'Synthetic recovery' },'inactive-owner'),restoreCtx)).status,409);
    await db.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL WHERE id=$1',[owner]);
    check((await restore(request(other,restorePath,'POST',{ expectedVersion:2,reason:'Synthetic recovery' },'recover-denied'),restoreCtx)).status,403);
    check((await restore(request(admin,restorePath,'POST',{ expectedVersion:2,reason:'short' },'short'),restoreCtx)).status,400);
    check((await restore(request(admin,restorePath,'POST',{ expectedVersion:2,reason:'Synthetic recovery' },'recover'),restoreCtx)).status,200);
    check((await restore(request(admin,restorePath,'POST',{ expectedVersion:2,reason:'Synthetic recovery' },'recover'),restoreCtx)).status,200);
    check((await db.query('SELECT count(*)::int AS n FROM attachments')).rows[0].n,1);
    check([...objects.values()][0]?.toString(),'Synthetic retained file');
    check((await detail(request(owner,ticketPath),ticketCtx)).status,200);
    const sent = await submit(request(owner,`${ticketPath}/submit`,'POST',{ expectedVersion:3 },'submit'),ticketCtx);
    check(sent.status,200); const submitted = (await sent.json()).ticket;
    check(submitted.id,draft.id); check(submitted.ticketNumber,'FSS-SYN-00001'); check(submitted.requestedDate,'2028-02-29T00:00:00.000Z');
    check((await submit(request(owner,`${ticketPath}/submit`,'POST',{ expectedVersion:3 },'submit'),ticketCtx)).status,200);
    check((await remove(request(owner,`${ticketPath}/draft`,'DELETE',{ expectedVersion:4 },'no-delete-submitted'),ticketCtx)).status,409);
    check((await upload()).status,409); check(objects.size,1);
    await db.query('SAVEPOINT invalid_submitted_intake');
    await assert.rejects(db.query('UPDATE tickets SET requested_date=NULL WHERE id=$1',[draft.id]),/tickets_submitted_intake_present/); checks++;
    await db.query('ROLLBACK TO SAVEPOINT invalid_submitted_intake');
    await db.query('RELEASE SAVEPOINT invalid_submitted_intake');
    check((await db.query('SELECT event_type FROM ticket_events ORDER BY created_at,id')).rows.map(r => r.event_type).sort(),
      ['attachment.uploaded','ticket.created','ticket.draft_deleted','ticket.draft_recovered','ticket.draft_saved','ticket.draft_saved','ticket.submitted'].sort());
    // An audit failure must roll back both creation and its replay entry.
    await db.query('ALTER TABLE ticket_events ADD CONSTRAINT synthetic_audit_failure CHECK (false) NOT VALID');
    check((await save(request(owner,`/api/projects/${project}/drafts`,'POST',{},'audit-failure'),projectCtx)).status,500);
    check((await db.query('SELECT count(*)::int AS n FROM tickets')).rows[0].n,1);
    check((await db.query("SELECT count(*)::int AS n FROM api_idempotency WHERE idempotency_key='audit-failure'")).rows[0].n,0);
    console.log(`Draft recovery PostgreSQL: ${checks} assertions passed; schema replay twice, actual routes, rollback-only synthetic writes.`);
  } finally {
    app.query = oldQuery; app.connect = oldConnect;
    await db.query('ROLLBACK'); check(await fingerprint(), before); db.release(); await pg.end(); await app.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Draft matrix failed'); process.exitCode = 1; });
