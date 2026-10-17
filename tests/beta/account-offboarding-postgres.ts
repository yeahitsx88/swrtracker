import assert from 'node:assert/strict';
import { Pool, type PoolClient } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface LifecycleSchemaFixture { tenant: string; project: string; actor: string; subject: string; foreignProject: string }
export async function runLifecycleSchemaAcceptance(
  acceptance?: (db: PoolClient, fixture: LifecycleSchemaFixture) => Promise<void>,
): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.SWR_TEAM_POSTGRES !== '1' || url.hostname !== '127.0.0.1' ||
      url.port !== '15489' || url.pathname !== '/swr_team_isolated') {
    throw new Error('Disposable loopback swr_team_isolated:15489 fixture only');
  }
  const pool = new Pool({ connectionString: url.href, max: 2 });
  const db = await pool.connect();
  const schema = 'offboarding_' + randomUUID().replaceAll('-', '');
  let checks = 0;
  const check = (name: string, fn: () => Promise<void>) => fn().then(() => {
    checks++; console.log('PASS ' + name);
  });
  const rejects = async (sql: string, params: unknown[], code: string) => {
    await db.query('SAVEPOINT invalid_write');
    let caught: unknown;
    try { await db.query(sql, params); } catch (error) { caught = error; }
    await db.query('ROLLBACK TO SAVEPOINT invalid_write');
    assert.equal((caught as { code?: string } | undefined)?.code, code);
  };
  const tenant = randomUUID(), foreignTenant = randomUUID();
  const company = randomUUID(), foreignCompany = randomUUID();
  const project = randomUUID(), foreignProject = randomUUID();
  const actor = randomUUID(), subject = randomUUID(), outsider = randomUUID();
  const ticket = randomUUID(), event = randomUUID(), attachment = randomUUID();
  const history = async (client: PoolClient) => {
    const records = [];
    for (const table of ['tickets', 'ticket_events', 'attachments', 'users', 'project_memberships']) {
      const rows = (await client.query(`SELECT row_to_json(t) AS record FROM ${table} t ORDER BY id`)).rows;
      // New access columns are intentionally additive. Compare all original fields.
      if (table === 'project_memberships') for (const row of rows) {
        delete row.record.access_disabled_at; delete row.record.access_disabled_by;
      }
      records.push(rows);
    }
    return createHash('sha256').update(JSON.stringify(records)).digest('hex');
  };
  try {
    await db.query('BEGIN');
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET LOCAL search_path TO "${schema}", public`);
    const migrations = (await readdir(resolve('db/migrations'))).filter(x => x.endsWith('.sql')).sort();
    for (const file of migrations.filter(x => x < '031_')) {
      await db.query(await readFile(resolve('db/migrations', file), 'utf8'));
    }
    await db.query("INSERT INTO tenants(id,name) VALUES($1,'Offboarding test'),($2,'Foreign test')", [tenant, foreignTenant]);
    await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC'),($3,$4,'Foreign GC','GC')",
      [company,tenant,foreignCompany,foreignTenant]);
    await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Local','ACTIVE','FULL'),($3,$4,'Foreign','ACTIVE','FULL')",
      [project,tenant,foreignProject,foreignTenant]);
    for (const [id,t,c,name] of [[actor,tenant,company,'Admin'],[subject,tenant,company,'Subject'],[outsider,foreignTenant,foreignCompany,'Outsider']]) {
      await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'fixture')",
        [id,t,c,id+'@example.test',name]);
    }
    await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'PROJECT_ADMIN'),($1,$3,'SURVEY_MANAGER')",
      [project,actor,subject]);
    await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT','Survey','Retained draft')",
      [ticket,tenant,project,company,subject]);
    await db.query("INSERT INTO ticket_events(id,ticket_id,tenant_id,actor_id,event_type,payload) VALUES($1,$2,$3,$4,'ticket.created','{\"history\":true}')",
      [event,ticket,tenant,subject]);
    await db.query("INSERT INTO attachments(id,ticket_id,tenant_id,uploaded_by,filename,mime_type,storage_key,size_bytes) VALUES($1,$2,$3,$4,'history.txt','text/plain','synthetic-history',17)",
      [attachment,ticket,tenant,subject]);
    const before = await history(db);
    const migration = migrations.find(x => x.startsWith('031_'));
    assert.ok(migration, 'missing031 scoped lifecycle migration');
    const migrationSql = await readFile(resolve('db/migrations', migration), 'utf8');
    await check('preflight_refuses_cross_tenant_membership', async () => {
      await db.query('SAVEPOINT legacy_bad_row');
      await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'REQUESTER')",[project,outsider]);
      let caught: unknown;
      try { await db.query(migrationSql); } catch(error) { caught=error; }
      await db.query('ROLLBACK TO SAVEPOINT legacy_bad_row');
      assert.equal((caught as { code?: string } | undefined)?.code,'P0001');
      assert.match((caught as Error).message,/project membership crosses tenant/);
    });
    await check('preflight_refuses_incomplete_deactivation', async () => {
      await db.query('SAVEPOINT legacy_bad_stamp');
      await db.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[subject]);
      let caught: unknown;
      try { await db.query(migrationSql); } catch(error) { caught=error; }
      await db.query('ROLLBACK TO SAVEPOINT legacy_bad_stamp');
      assert.equal((caught as { code?: string } | undefined)?.code,'P0001');
      assert.match((caught as Error).message,/deactivation provenance/);
    });
    await db.query(migrationSql);

    await check('existing_history_survives_migration', async () => assert.equal(await history(db), before));
    await check('legacy_admin_backfill_preserves_operational_role', async () => {
      const row = (await db.query("SELECT origin,granted_by FROM project_admin_grants WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3",
        [tenant,project,actor])).rows[0];
      assert.equal(row.origin,'LEGACY_MEMBERSHIP'); assert.equal(row.granted_by,null);
      assert.equal((await db.query('SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2',[project,subject])).rows[0].role,'SURVEY_MANAGER');
    });
    await check('membership_access_stamp_pairing', async () =>
      rejects('UPDATE project_memberships SET access_disabled_at=NOW() WHERE project_id=$1 AND user_id=$2',[project,subject],'23514'));
    await check('membership_disable_actor_same_tenant', async () =>
      rejects('UPDATE project_memberships SET access_disabled_at=NOW(),access_disabled_by=$3 WHERE project_id=$1 AND user_id=$2',[project,subject,outsider],'23503'));
    await check('tenant_membership_same_tenant', async () =>
      rejects("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[tenant,outsider],'23503'));
    await check('global_disable_actor_same_tenant', async () =>
      rejects('UPDATE users SET deactivated_at=NOW(),deactivated_by=$2 WHERE id=$1',[subject,outsider],'23503'));
    const grantSql = "INSERT INTO project_admin_grants(tenant_id,project_id,user_id,granted_by,origin) VALUES($1,$2,$3,$4,'EXPLICIT')";
    await check('admin_grant_uniqueness', async () => rejects(grantSql,[tenant,project,actor,actor],'23505'));
    await check('admin_grant_foreign_project', async () => rejects(grantSql,[tenant,foreignProject,subject,actor],'23503'));
    await check('admin_grant_foreign_subject', async () => rejects(grantSql,[tenant,project,outsider,actor],'23503'));
    const lifecycle = randomUUID();
    const lifecycleSql = `INSERT INTO account_lifecycle_events(id,tenant_id,scope,project_id,subject_user_id,actor_id,event_type,reason,prior_state,new_state,prior_session_version,new_session_version,authority_evidence,snapshot,correlation_key)
      VALUES($1,$2,'PROJECT_ACCESS',$3,$4,$5,'user.project_access_disabled','Departure confirmed','ACTIVE','DISABLED',1,2,'{}','snapshot','correlation')`;
    await check('lifecycle_scope_fk_subject', async () => rejects(lifecycleSql,[randomUUID(),tenant,project,outsider,actor],'23503'));
    await check('lifecycle_scope_fk_actor', async () => rejects(lifecycleSql,[randomUUID(),tenant,project,subject,outsider],'23503'));
    await check('lifecycle_scope_fk_project', async () => rejects(lifecycleSql,[randomUUID(),tenant,foreignProject,subject,actor],'23503'));
    await db.query(lifecycleSql,[lifecycle,tenant,project,subject,actor]);
    await check('lifecycle_scope_requires_project', async () => {
      const sql=lifecycleSql.replace("'PROJECT_ACCESS'","'TENANT_ACCOUNT'").replace("'user.project_access_disabled'","'user.deactivated'");
      await rejects(sql,[randomUUID(),tenant,project,subject,actor],'23514');
    });
    await check('event_immutability_update_runtime_role', async () =>
      rejects("UPDATE account_lifecycle_events SET reason='Changed reason' WHERE id=$1",[lifecycle],'55000'));
    await check('event_immutability_delete_runtime_role', async () =>
      rejects('DELETE FROM account_lifecycle_events WHERE id=$1',[lifecycle],'55000'));
    await check('event_immutability_truncate_runtime_role', async () =>
      rejects('TRUNCATE account_lifecycle_events CASCADE',[],'55000'));
    const review=randomUUID();
    await db.query(`INSERT INTO account_offboarding_reviews(id,tenant_id,project_id,subject_user_id,requested_by,local_event_id,reason,recipient_ids)
      VALUES($1,$2,$3,$4,$5,$6,'Departure confirmed',$7)`,[review,tenant,project,subject,actor,lifecycle,[actor]]);
    const orphanEvent=randomUUID();
    await db.query(lifecycleSql,[orphanEvent,tenant,project,subject,actor]);
    await check('review_cannot_reference_foreign_event', async () =>
      rejects(`INSERT INTO account_offboarding_reviews(tenant_id,project_id,subject_user_id,requested_by,local_event_id,reason,recipient_ids)
      VALUES($1,$2,$3,$4,$5,'Departure confirmed',$6)`,[foreignTenant,foreignProject,outsider,outsider,orphanEvent,[outsider]],'23503'));
    await db.query('INSERT INTO administrative_notification_outbox(tenant_id,review_id,recipient_id) VALUES($1,$2,$3)',[tenant,review,actor]);
    await check('review_outbox_recipient_unique', async () =>
      rejects('INSERT INTO administrative_notification_outbox(tenant_id,review_id,recipient_id) VALUES($1,$2,$3)',[tenant,review,actor],'23505'));
    await check('review_outbox_recipient_same_tenant', async () =>
      rejects('INSERT INTO administrative_notification_outbox(tenant_id,review_id,recipient_id) VALUES($1,$2,$3)',[tenant,review,outsider],'23503'));
    await check('project_company_association_same_tenant', async () =>
      rejects('INSERT INTO project_companies(tenant_id,project_id,company_id,associated_by) VALUES($1,$2,$3,$4)',[tenant,project,foreignCompany,actor],'23503'));
    await check('review_recipients_same_tenant', async () => {
      await rejects('UPDATE account_offboarding_reviews SET recipient_ids=$2 WHERE id=$1',[review,[outsider]],'23503');
    });
    await check('review_recipients_deduplicated', async () => {
      await rejects('UPDATE account_offboarding_reviews SET recipient_ids=$2 WHERE id=$1',[review,[actor,actor]],'23514');
    });
    await check('review_resolution_requires_reason', async () => {
      await rejects("UPDATE account_offboarding_reviews SET status='RESOLVED',resolved_at=NOW(),resolved_by=$2,disposition='NO_FURTHER_ACTION' WHERE id=$1",[review,actor],'23514');
    });
    await check('review_resolution_requires_global_subject_event', async () => {
      await rejects("UPDATE account_offboarding_reviews SET status='RESOLVED',resolved_at=NOW(),resolved_by=$2,disposition='TENANT_ACCOUNT_DISABLED',resolution_reason='Departure confirmed',tenant_event_id=$3 WHERE id=$1",[review,actor,lifecycle],'23514');
    });
    await check('outbox_recipient_belongs_to_review', async () => {
      await rejects('INSERT INTO administrative_notification_outbox(tenant_id,review_id,recipient_id) VALUES($1,$2,$3)',[tenant,review,subject],'23514');
    });
    await check('append_lifecycle_event_preserves_scope_and_evidence', async () => {
      const { appendLifecycleEvent } = await import('../../src/modules/identity/infrastructure/account-lifecycle.repository');
      type UUID = import('../../src/shared/types').UUID;
      const emitted = await appendLifecycleEvent(db,{
        scope:{kind:'TENANT_ACCOUNT'},tenantId:tenant as UUID,projectId:null,
        actorUserId:actor as UUID,subjectUserId:subject as UUID,reason:'Departure confirmed',
        priorState:'ACTIVE',newState:'DISABLED',priorSessionVersion:1,newSessionVersion:2,
        authorityEvidence:{branch:'CENTRAL_IT'},snapshot:'server-snapshot',correlationKey:'test-correlation'
      });
      const stored=(await db.query('SELECT scope,project_id,event_type,actor_id,authority_evidence FROM account_lifecycle_events WHERE id=$1',[emitted])).rows[0];
      assert.deepEqual(stored,{scope:'TENANT_ACCOUNT',project_id:null,event_type:'user.deactivated',actor_id:actor,authority_evidence:{branch:'CENTRAL_IT'}});
    });
    // Current application reads require additive migrations after the legacy031 assertions.
    // Callers own032 (not idempotent); apply033 and later before their callback.
    for (const file of migrations.filter(name => name >= '033_')) {
      const sql = await readFile(resolve('db/migrations', file), 'utf8');
      // The owned fixture already supplies the transaction. Migration042's
      // standalone wrapper must not commit it and reset SET LOCAL to public.
      const fixtureSql = file.startsWith('042_')
        ? sql.replace(/^BEGIN;\r?$/m, '').replace(/^COMMIT;\r?$/m, '') : sql;
      await db.query(fixtureSql);
      assert.equal((await db.query('SELECT current_schema() AS name')).rows[0].name, schema,
        'Every runtime migration must remain inside the owned rollback schema');
    }
    if (typeof acceptance === 'function') await acceptance(db,{tenant,project,actor,subject,foreignProject});
    console.log(`Scoped lifecycle PostgreSQL schema checks passed: ${checks}`);
  } finally {
    await db.query('ROLLBACK'); db.release(); await pool.end();
  }
}
if (process.argv[1]?.replaceAll('\\','/').endsWith('/account-offboarding-postgres.ts')) {
  runLifecycleSchemaAcceptance().catch(error => { console.error(error); process.exitCode=1; });
}
