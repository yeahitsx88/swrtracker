// Explicitly selected disposable loopback database only. Never reset retained data.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {Pool} from 'pg';
const url=new URL(process.env.DATABASE_URL??'');
assert.equal(process.env.SWR_TEAM_POSTGRES,'1','Explicit SWR_TEAM_POSTGRES=1 required');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
const run=(file,args=[])=>{
 const child=spawnSync(process.execPath,[...(file.endsWith('.ts')?['--import','tsx']:[]),file,...args],{env:process.env,stdio:'inherit',timeout:600000});
 if(child.error)throw child.error;
 assert.equal(child.status,0,file+' failed');
};
const db=new Pool({connectionString:url.href});
try{
 const count=(await db.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n;
 if(count===0)run('db/migrate.ts');
 // An existing fixture's public schema is read only to this runner. Each suite
 // creates its own rollback/session-local or uniquely named schema.
 assert.ok((await db.query("SELECT to_regclass('public.tickets') AS relation")).rows[0].relation,'Migrate an empty disposable database first');
}finally{await db.end();}
run('tests/beta/scoped-offboarding-case-matrix.mjs',['pg']);
for(const suite of ['alpha1-stabilization-postgres.ts','administrative-events-postgres.ts','continuity-recovery-postgres.ts','phase5-review-postgres.ts'])run('tests/beta/'+suite);
console.log('PostgreSQL verification passed: 23 matrix suites and 4 additional suites. HTTP/browser acceptance is a separate gate.');
