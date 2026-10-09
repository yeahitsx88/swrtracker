// Creates a fresh fully migrated metrics namespace; never seeds retained/public schemas.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const url=new URL(process.env.DATABASE_URL??'');
assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
const schema='alpha_metrics214_'+randomUUID().replaceAll('-',''),pool=new Pool({connectionString:url.href}),db=await pool.connect();
try{await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET search_path TO "${schema}",public`);for(const name of(await readdir('db/migrations')).filter(n=>n.endsWith('.sql')).sort()){await db.query(await readFile('db/migrations/'+name,'utf8'));assert.equal((await db.query('SELECT current_schema() name')).rows[0].name,schema);}}finally{db.release();await pool.end();}
const scoped=new URL(url);scoped.searchParams.set('options','-c search_path='+schema+',public');
await writeFile('.local-metrics-schema.json',JSON.stringify({schema}));await writeFile('.local-metrics-runtime.env','DATABASE_URL='+scoped.href+'\nJWT_SECRET='+process.env.JWT_SECRET+'\nSWR_TEAM_POSTGRES=1\n');
for(const name of ['scoped-metrics-postgres.ts','survey-teams-postgres.ts','superintendent-kpi-postgres.ts']){const result=spawnSync(process.execPath,['--import','tsx','tests/beta/'+name],{env:{...process.env,DATABASE_URL:scoped.href,SWR_METRICS_POSTGRES:'1'},stdio:'inherit',timeout:180000});assert.equal(result.status,0,name);console.log('PASS current metrics suite '+name);}
console.log('Current metrics SQL acceptance completed in newly owned schema.');
