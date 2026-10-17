// One-shot, opt-in cutover of the owned local Sabine preview. No reseed or purge.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
assert.equal(process.env.SWR_DRAFT_PREVIEW_CUTOVER,'1');
const web='swrtracker-sabine-web',prior='swrtracker-sabine-web-before-drafts-20260930';
const dbContainer='swrtracker-sabine-simulation',network='swrtracker-sabine-network',volume='swrtracker-sabine-attachments';
const image='swrtracker:sabine-drafts-20260930';
// Container PATH is inherited as an application setting below. Resolve Docker
// independently so a Linux PATH cannot prevent Windows from launching its CLI.
const docker=process.platform==='win32'
  ? 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe' : 'docker';
const resume=process.env.SWR_DRAFT_PREVIEW_RESUME==='1';
const run=(args,env=process.env)=>{
  const result=spawnSync(docker,args,{env,encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error(`Docker ${args[0]} failed; inspect the owned container separately.`);
  return result.stdout.trim();
};
const inspect=name=>JSON.parse(run(['inspect',name]))[0];
const backupRoot=path.resolve('.data/sabine/backups/drafts-20260930');
assert.ok(backupRoot.startsWith(path.resolve('.data/sabine/backups')+path.sep));assert.ok(fs.statSync(backupRoot).isDirectory());
for(const file of ['database.dump','attachments.tar']){
  assert.equal(fs.existsSync(path.join(backupRoot,file)),resume,'Do not overwrite checkpoint backups');
  if(resume)assert.ok(fs.statSync(path.join(backupRoot,file)).size>0);
}
const current=inspect(web);
assert.equal(current.Config.Image,'swrtracker:sabine-assessment-20260930');assert.equal(current.Config.User,'node');assert.equal(current.State.Running,true);
assert.equal(current.Config.Labels['swrtracker.simulation'],'sabine');
assert.deepEqual(current.HostConfig.PortBindings['3000/tcp'],[{HostIp:'127.0.0.1',HostPort:'3106'}]);
assert.deepEqual(current.Mounts.map(m=>[m.Type,m.Name,m.Destination]),[['volume',volume,'/var/lib/swr/attachments']]);
assert.deepEqual(Object.keys(current.NetworkSettings.Networks),[network]);
const names=run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/);assert.equal(names.includes(prior),false);
const env={...process.env};
for(const entry of current.Config.Env){const split=entry.indexOf('=');env[entry.slice(0,split)]=entry.slice(split+1);}
assert.equal(env.SWR_ATTACHMENT_ROOT,'/var/lib/swr/attachments');
const runtime=JSON.parse(fs.readFileSync('.data/sabine/runtime.json','utf8'));
const url=new URL(runtime.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15488');assert.equal(url.pathname,'/swr_sabine_simulation');
const imageId=run(['image','inspect',image,'--format','{{.Id}}']);
const db=new Pool({connectionString:url.href,max:1});let renamed=false,created=false;
const fingerprintSql=`SELECT json_build_object('n',count(*)::text,'hash',md5(string_agg(
  (to_jsonb(t)-'draft_last_saved_at'-'draft_deleted_at'-'draft_deleted_reason')::text,',' ORDER BY id))) AS value FROM public.tickets t`;
const fingerprint=async()=> (await db.query(fingerprintSql)).rows[0].value;
const restoreContainer='swrtracker-drafts-backup-review-20260930';let restoreStarted=false;
try {
  assert.equal((await db.query("SELECT count(*)::int AS n FROM _migrations WHERE filename='029_partial_drafts_and_recovery.sql'")).rows[0].n,resume?1:0);
  let restored;
  if(resume){
    // Retry only against the preserved checkpoint, never silently capture a new
    // baseline after a partial cutover. Restore into an isolated, unexposed DB.
    assert.equal(names.includes(restoreContainer),false);
    run(['run','-d','--name',restoreContainer,'--label','swrtracker.simulation=sabine-backup-review',
      '--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:15-alpine']);restoreStarted=true;
    let ready=false;
    for(let attempt=0;attempt<30;attempt++){
      const probe=spawnSync(docker,['exec',restoreContainer,'pg_isready','-U','postgres'],{encoding:'utf8',windowsHide:true});
      if(probe.status===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert.equal(ready,true,'Isolated backup review DB unavailable');
    run(['cp',path.join(backupRoot,'database.dump'),`${restoreContainer}:/tmp/checkpoint.dump`]);
    run(['exec',restoreContainer,'pg_restore','-U','postgres','-d','postgres','--no-owner','--no-privileges','--exit-on-error','/tmp/checkpoint.dump']);
    restored=JSON.parse(run(['exec',restoreContainer,'psql','-U','postgres','-d','postgres','-At','-c',fingerprintSql]));
    run(['run','--rm','--network','none','--user','1000:1000','-v',`${backupRoot}:/backup:ro`,image,'tar','-tf','/backup/attachments.tar']);
  }
  run(['stop',web]); // Quiesce the owned app while the DB and files are captured.
  const before=await fingerprint();
  if(resume)assert.deepEqual(before,restored,'Live request fields no longer match the preserved backup');
  if(!resume){
  run(['exec',dbContainer,'pg_dump','-U',decodeURIComponent(url.username),'-d','swr_sabine_simulation','-Fc','-f','/tmp/swr-drafts-20260930.dump']);
  run(['cp',`${dbContainer}:/tmp/swr-drafts-20260930.dump`,path.join(backupRoot,'database.dump')]);
  run(['run','--rm','--network','none','--user','1000:1000','-v',`${volume}:/attachments:ro`,'-v',`${backupRoot}:/backup`,image,
    'tar','-C','/attachments','-cf','/backup/attachments.tar','.']);
  assert.ok(fs.statSync(path.join(backupRoot,'database.dump')).size>0);assert.ok(fs.statSync(path.join(backupRoot,'attachments.tar')).size>0);
  const client=await db.connect();
  try {await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");
    await client.query(fs.readFileSync('db/migrations/029_partial_drafts_and_recovery.sql','utf8'));
    await client.query("INSERT INTO _migrations(filename) VALUES('029_partial_drafts_and_recovery.sql')");await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  assert.deepEqual(await fingerprint(),before,'Existing request fields must remain unchanged');
  run(['rename',web,prior]);renamed=true;
  const envArgs=current.Config.Env.flatMap(entry=>['-e',entry.slice(0,entry.indexOf('='))]);
  run(['create','--name',web,'--label','swrtracker.simulation=sabine','--network',network,'-p','127.0.0.1:3106:3000',
    ...envArgs,'-v',`${volume}:/var/lib/swr/attachments`,image],env);created=true;
  run(['start',web]);
  const next=inspect(web);assert.equal(next.Image,imageId);assert.equal(next.Config.User,'node');
  const oldEnv=[...current.Config.Env].sort(),newEnv=[...next.Config.Env].sort();
  if(JSON.stringify(oldEnv)!==JSON.stringify(newEnv))throw new Error('Preview settings changed unexpectedly');
  let healthy=false;
  for(let attempt=0;attempt<20;attempt++){try{healthy=(await fetch('http://127.0.0.1:3106/api/health',{signal:AbortSignal.timeout(1500)})).ok;}catch{}if(healthy)break;await new Promise(resolve=>setTimeout(resolve,250));}
  assert.equal(healthy,true,'Updated preview did not become healthy');
  assert.deepEqual(await fingerprint(),before);
  run(['tag',image,'swrtracker:sabine-linux']);
  console.log(JSON.stringify({preview:'http://127.0.0.1:3106',imageId,migration:29,requestsUnchanged:before.n,
    coordinatedBackups:true,isolatedDatabaseRestoreVerified:resume,attachmentArchiveReadable:resume,
    attachmentVolumePreserved:true,previousContainerRetained:true,health:200}));
}catch(error){
  if(created)run(['stop',web]);
  // Preserve any failed new container, never delete data or reverse the schema.
  if(created)run(['rename',web,'swrtracker-sabine-web-drafts-failed-20260930']);
  if(renamed)run(['rename',prior,web]);
  run(['start',web]);throw error;
}finally{if(restoreStarted)run(['stop',restoreContainer]);await db.end();}
