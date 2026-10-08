// Named acceptance gate. A case passes only after every listed executable suite
// passes against the same implementation digest. Counts are not substitutes for cases.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';

const C='account-offboarding-commands-postgres.ts',O='offboarding-policy-postgres.ts',
  B='offboarding-blockers-postgres.ts',R='account-offboarding-concurrency-postgres.ts',
  W='lifecycle-writer-handlers-postgres.ts',S='active-duty-subject-postgres.ts',
  I='identity-lifecycle-atomic-postgres.ts',P='project-administration-postgres.ts',
  K='project-capabilities-postgres.ts',N='notification-worker-lifecycle-postgres.ts',
  M='project-member-atomic-postgres.ts',T='ticket-replay-authority-postgres.ts',E='ticket-assignee-eligibility-postgres.ts',V='ticket-replay-visibility-postgres.ts',H='http',U='browser';
export const cases=[
 ['A01','tenant_disable_atomic',C,H],['A02','central_without_project',O,P],
 ['A03','local_cannot_disable_tenant',O,H],['A04','subcontractor_cannot_be_central',O,K],
 ['A05','fresh_bearer_after_wait',R,W],['A06','unauthorized_foreign_subject',O],
 ['A07','foreign_and_missing_subject_indistinguishable',O,H],['A08','self_disable_refused',O,H],
 ['A09','last_eligible_central_continuity',R,O,M],['A10','actual_manager_continuity',R,O,K],
 ['A11','all_live_blocker_families',B,H,O],['A12','history_and_drafts_are_retained',C,H,B],
 ['A13','already_disabled_fresh_noop',C,O],['A14','same_key_race_and_lost_response',C,H,U],
 ['A15','changed_intent_key_mismatch',C,O],['A16','different_key_one_transition',H],
 ['A17','snapshot_changes_require_reload',O,U],['A18','subject_writer_waits_and_revalidates',S,M,W,E],
 ['A19','protected_writer_barrier_both_orders',R,W,V],['A20','copied_old_sessions_rejected',R,W,H],
 ['A21','authority_loss_before_replay',C,P,R,W,T,V,H],['A22','reset_and_invite_cannot_restore',I,H],
 ['A23','conditional_event_ledger_commit_rollback',C,U],['A24','extra_domain_fields_rejected',O,W],
 ['A25','terminal_history_file_digest_preserved',H,C],['A26','workers_preserve_assignments',N,C],
 ['A27','frozen_accessible_scoped_browser_recovery',U],['A28','reactivation_refused',O,I,M],
 ['A29','local_transition_atomic',C,H],['A30','outside_project_denied',P,H],
 ['A31','other_project_duties_and_access_preserved',O,H],['A32','renewed_local_access_and_central_warning',K,O,H],
 ['A33','stacked_roles_scope_stays_explicit',K,H,U],['A34','durable_review_recipients_deduplicated',C,K,H],
 ['A35','local_retry_one_review',C,H,U],['A36','outbox_failure_atomic_delivery_retry',C],
 ['A37','separate_global_decision_and_linked_review',C,O,H,U],['A38','no_central_local_disable_truthful',H],
 ['A39','archived_access_metadata_only',B,O,U],['A40','independent_admin_and_current_race_authority',P,K,W],
 ['P01','local_administration_parity',P],['P02','manager_only_no_admin',K,O],
 ['P03','central_admin_manager_navigation',K,U],['P04','admin_grant_preserves_manager',P],
 ['P05','operational_role_preserves_admin',P,K],['P06','foreign_project_isolation',P,H],
 ['P07','local_and_tenant_decisions_separate',C,H,U],['P08','authority_and_subject_races',S,M,W,C,P],
 ['P09','tenant_role_template_project_creation_denied',P],['P10','legacy_grant_no_invented_manager',K],
 ['P11','one_person_one_notification_and_witness',K,R,H],['P12','archived_admin_local_access_only',B,O,U],
 ['P13','local_admin_not_central_replacement',R,O,M],['P14','direct_http_enforces_authority',P,H,W],
 ['P15','central_manager_actual_operational_semantics',K,U],
];
assert.equal(cases.length,55);assert.equal(new Set(cases.map(row=>row[0])).size,55);
const mode=process.argv[2];assert.ok(['pg','external','report'].includes(mode),'Choose pg, external or report');
const url=new URL(process.env.DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');assert.equal(process.env.SWR_TEAM_POSTGRES,'1');
const files=async(root)=>{const out=[];for(const entry of await fs.readdir(root,{withFileTypes:true})){const path=root+'/'+entry.name;if(entry.isDirectory())out.push(...await files(path));else out.push(path);}return out;};
const hash=createHash('sha256');for(const path of [...await files('src'),...await files('db/migrations')].sort()){hash.update(path);hash.update(await fs.readFile(path));}
const implementation=hash.digest('hex'),record='.local-case-results.json';
let result;try{result=JSON.parse(await fs.readFile(record,'utf8'));}catch{result={implementation,suites:{}};}
if(result.implementation!==implementation)result={implementation,suites:{}};
const run=async(file,args=[],env=process.env)=>{
 const extension=file.endsWith('.ts')?['--import','tsx']:[];
 const child=spawnSync(process.execPath,[...extension,'tests/beta/'+file,...args],{env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 await fs.writeFile('.local-case-'+file.replace(/[^a-z0-9-]/gi,'_')+'.log',(child.stdout??'')+(child.stderr??''));
 assert.equal(child.status,0,`${file}: ${child.error?.message??child.stderr?.slice(-1200)??'suite failed'}`);
 console.log('PASS suite '+file);return {at:new Date().toISOString(),exitCode:0};
};
if(mode==='pg'){
 const suites=[...new Set(cases.flatMap(row=>row.slice(2)).filter(x=>x!==H&&x!==U))];
 for(const suite of suites)result.suites[suite]=await run(suite);
 // Existing PostgreSQL regressions need their own committed, fully migrated schema.
 const schema='phase5_regression_'+randomUUID().replaceAll('-',''),pg=new Pool({connectionString:url.href});const db=await pg.connect();let created=false;
 try{
  // Migration042 commits its wrapper; retain session schema for later migrations.
  await db.query('BEGIN');await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET search_path TO "${schema}",public`);
  for(const migration of (await fs.readdir('db/migrations')).filter(p=>p.endsWith('.sql')).sort()){await db.query(await fs.readFile('db/migrations/'+migration,'utf8'));assert.equal((await db.query('SELECT current_schema() AS name')).rows[0].name,schema,'Migration must stay in the newly owned schema');}
  await db.query('COMMIT');created=true;const scoped=new URL(url);scoped.searchParams.set('options','-c search_path='+schema+',public');
  const env={...process.env,DATABASE_URL:scoped.href,JWT_SECRET:process.env.JWT_SECRET??'synthetic-regression-secret-long-enough'};
  for(const suite of ['survey-teams-postgres.ts','survey-staffing-postgres.ts','survey-staffing-safety-postgres.ts','protected-obligations-postgres.ts','protected-obligations-concurrency-postgres.ts','superintendent-area-postgres.ts','superintendent-area-concurrency-postgres.ts','team-workforce-postgres.ts','draft-recovery-postgres.ts'])result.suites[suite]=await run(suite,[],env);
 }finally{await db.query('ROLLBACK');if(created){assert.match(schema,/^phase5_regression_[a-f0-9]{32}$/);await db.query(`DROP SCHEMA "${schema}" CASCADE`);}db.release();await pg.end();}
}
if(mode==='external'){
 // The operator first wires the named production runtime to setup's owned schema.
 result.suites[H]=await run('scoped-offboarding-acceptance.mjs',['http']);
 result.suites[U]=await run('scoped-offboarding-browser.mjs');
}
await fs.writeFile(record,JSON.stringify(result,null,2));
let passed=0;for(const [id,name,...suites] of cases){const missing=suites.filter(suite=>result.suites[suite]?.exitCode!==0);if(!missing.length){console.log(`PASS ${id}_${name}`);passed++;}else console.log(`OPEN ${id}_${name}: ${missing.join(', ')}`);}
console.log(`Acceptance cases: ${passed}/55; implementation ${implementation}`);
if(mode==='report')assert.equal(passed,55,'Every approved acceptance case needs current executable evidence');
