// Owned synthetic populated upgrade. No retained schema or service is writable.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {Pool} from 'pg';
assert.equal(process.env.SWR_RECONCILIATION,'1');
const url=new URL(process.env.DATABASE_URL??'');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
const schema='reconcile_upgrade_'+randomUUID().replaceAll('-','');url.searchParams.set('options','-c search_path='+schema+',public');
const root=new Pool({connectionString:process.env.DATABASE_URL}),pool=new Pool({connectionString:url.href}),checks=[];
const check=(value,label)=>{assert(value,label);checks.push(label);};
const files=(await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort();
let db;
try{
 await root.query('CREATE SCHEMA "'+schema+'"');db=await pool.connect();
 await db.query('CREATE TABLE _migrations(id SERIAL PRIMARY KEY,filename TEXT NOT NULL UNIQUE,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 async function apply(file){await db.query('BEGIN');try{await db.query(await readFile('db/migrations/'+file,'utf8'));await db.query('INSERT INTO _migrations(filename) VALUES($1)',[file]);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}}
 for(const file of files.filter(n=>n<'035_'))await apply(file);
 const [tenant,company,project,user,request,team,level,area]=Array.from({length:8},()=>randomUUID());
 await db.query("INSERT INTO tenants(id,name) VALUES($1,'Owned populated upgrade')",[tenant]);
 await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned GC','GC')",[company,tenant]);
 await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned project','ACTIVE','MEDIUM')",[project,tenant]);
 await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Owned Manager','synthetic')",[user,tenant,company,user+'@example.invalid']);
 await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_MANAGER')",[project,user]);
 await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
 await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Owned Area','UP')",[area,tenant,project,level]);
 await db.query('BEGIN');
 await db.query("INSERT INTO survey_teams(id,tenant_id,project_id,name,aor_node_id,lead_user_id,created_by) VALUES($1,$2,$3,'Owned team',$4,$5,$5)",[team,tenant,project,area,user]);
 await db.query('INSERT INTO survey_team_members(tenant_id,project_id,team_id,user_id) VALUES($1,$2,$3,$4)',[tenant,project,team,user]);
 await db.query('COMMIT');
 await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT','Survey','Original populated draft')",[request,tenant,project,company,user]);
 await db.query("INSERT INTO ticket_events(ticket_id,tenant_id,actor_id,event_type,payload) VALUES($1,$2,$3,'ticket.created','{\"retained\":true}')",[request,tenant,user]);
 const bytes=Buffer.from('Owned original attachment bytes');
 await db.query("INSERT INTO attachments(id,ticket_id,tenant_id,uploaded_by,filename,mime_type,storage_key,size_bytes) VALUES($1,$2,$3,$4,'original.txt','text/plain','owned-upgrade-original',$5)",[randomUUID(),request,tenant,user,bytes.length]);
 const tables=['tenants','companies','projects','users','project_memberships','tickets','ticket_events','attachments','survey_teams'];
 const originals={};for(const table of tables)originals[table]=(await db.query('SELECT to_jsonb(r) body FROM '+table+' r ORDER BY to_jsonb(r)::text')).rows.map(r=>r.body);
 const digest=createHash('sha256').update(JSON.stringify(originals)).digest('hex');
 for(const file of files.filter(n=>n>='035_'&&n<'040_'))await apply(file);
 const matched=randomUUID(),unmatched=randomUUID();
 for(const [id,key]of [[matched,request+':submitted:old'],[unmatched,'unmatched-historical-notice']])await db.query("INSERT INTO survey_notifications(id,tenant_id,project_id,recipient_id,actor_id,event_key,title,message) VALUES($1,$2,$3,$4,$4,$5,'Retained notice','Retained text')",[id,tenant,project,user,key]);
 // Exercise real042's early COMMIT/bookkeeping failure and repeatable recovery.
 await db.query("CREATE FUNCTION refuse_042_bookkeeping() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.filename LIKE '042_%' THEN RAISE EXCEPTION 'owned bookkeeping fault'; END IF; RETURN NEW; END $$");
 await db.query('CREATE TRIGGER bookkeeping_fault BEFORE INSERT ON _migrations FOR EACH ROW EXECUTE FUNCTION refuse_042_bookkeeping()');
 const migrate=()=>spawnSync(process.execPath,['--import','tsx','db/migrate.ts'],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});
 const failed=migrate();check(failed.status!==0&&failed.stderr.includes('owned bookkeeping fault'),'042 bookkeeping fault is visible');
 check((await db.query("SELECT count(*)::int n FROM _migrations WHERE filename LIKE '042_%'")).rows[0].n===0,'Failed bookkeeping does not claim042 applied');
 check((await db.query("SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid='ticket_return_cycles'::regclass AND contype='c'")).rows.some(r=>r.d.includes('SUBMITTED_RECOVERY')),'042 schema change persists across its historical early COMMIT');
 await db.query('DROP TRIGGER bookkeeping_fault ON _migrations');
 const applied=migrate();check(applied.status===0,'Actual migration runner recovers and applies remaining migrations');
 const replay=migrate();check(replay.status===0&&!replay.stdout.includes('  apply '),'Actual migration replay skips every applied file');
 check((await db.query('SELECT count(*)::int n FROM _migrations')).rows[0].n===files.length,'Migration bookkeeping matches complete file inventory');
 for(const table of tables){const actual=(await db.query('SELECT to_jsonb(r) body FROM '+table+' r ORDER BY to_jsonb(r)::text')).rows.map(r=>r.body);check(actual.length===originals[table].length,table+' identities retained');for(let i=0;i<actual.length;i++)for(const key of Object.keys(originals[table][i]))assert.deepEqual(actual[i][key],originals[table][i][key],table+'.'+key+' retained');}
 check((await db.query('SELECT actor_kind FROM ticket_events')).rows.every(r=>r.actor_kind==='USER'),'Existing human events default to USER');
 check((await db.query('SELECT area_id FROM survey_team_areas WHERE team_id=$1',[team])).rows[0].area_id===area,'037 backfills original team Area');
 check((await db.query('SELECT ticket_id FROM survey_notifications WHERE id=$1',[matched])).rows[0].ticket_id===request,'040 resolves matching notice to original request');
 check((await db.query('SELECT ticket_id FROM survey_notifications WHERE id=$1',[unmatched])).rows[0].ticket_id===null,'040 preserves unmatched historical notice');
 await db.query("INSERT INTO ticket_events(ticket_id,tenant_id,actor_kind,actor_id,event_type,payload) VALUES($1,$2,'SYSTEM',NULL,'approver.timeout_warning_sent','{}')",[request,tenant]);
 check((await db.query("SELECT count(*)::int n FROM ticket_events WHERE actor_kind='SYSTEM' AND actor_id IS NULL")).rows[0].n===1,'043 accepts explicit nonhuman identity');
 await assert.rejects(db.query('DELETE FROM ticket_events WHERE ticket_id=$1',[request]));checks.push('Append-only events remain protected');
 await assert.rejects(db.query("INSERT INTO tenant_custom_roles(tenant_id,name,base_role,created_by) VALUES($1,'Unsafe authority','SURVEY_MANAGER',$2)",[tenant,user]));checks.push('Custom aliases cannot confer Survey authority');
 await writeFile('audits/alpha1-reconciliation/populated-upgrade.json',JSON.stringify({schemaKind:'new owned disposable',checks,migrationCount:files.length,originalRecordDigest:digest,attachmentSha256:createHash('sha256').update(bytes).digest('hex'),limits:['File byte authorization is exercised separately by HTTP acceptance.']},null,2)+'\n');
 console.log('Populated upgrade verified: '+checks.length+' named checks');
}finally{db?.release();await pool.end();await root.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await root.end();}
