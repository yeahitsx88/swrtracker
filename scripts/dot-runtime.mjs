// Host launcher: native Node only. Never loads .env or inherits a database target.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import net from 'node:net';
import {names,assertOwner,assertDataRoot,assertLocalDockerTarget,validateRuntime,validatePopulation,databaseUrl,newRuntime,newPopulation} from './dot-sim/policy.mjs';

const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if (process.cwd() !== checkout) throw new Error('Run dot commands from the quarantined checkout root');
const root = path.join(checkout,'.data','dot-sim');
assertDataRoot(checkout,root);
const settings = path.join(root,'runtime.json'), credentials = path.join(root,'credentials.json');
const command = process.argv[2];
if (!['setup','start','stop','status','smoke','smoke-invitations','recreate-web'].includes(command)) throw new Error('Expected setup, start, stop, status, smoke, smoke-invitations or recreate-web');
const shellEnv = {...process.env, NEXT_TELEMETRY_DISABLED:'1'};
// Child tools receive only named, generated app settings. Ignore inherited integration settings.
for (const key of Object.keys(shellEnv)) if (/DATABASE_URL|JWT_SECRET|EMAIL_|SWR_ATTACHMENT_ROOT/.test(key)) delete shellEnv[key];
function run(exe,args,env=shellEnv,timeout=120000) {
  const result = spawnSync(exe,args,{cwd:checkout,env,encoding:'utf8',timeout,maxBuffer:16*1024*1024});
  if (result.status !== 0) throw new Error(`${path.basename(exe)} ${args[0]} failed (exit ${result.status ?? 'unavailable'}); raw output withheld to protect local secrets`);
  return result.stdout.trim();
}
const docker = (args,env,timeout) => run('docker',args,env,timeout);
function exists(kind,name) {
  const args = kind === 'container' ? ['ps','-a','--format','{{.Names}}'] : [kind,'ls','--format','{{.Name}}'];
  return docker(args).split(/\r?\n/).includes(name);
}
function inspect(kind,name,config) {
  if (!exists(kind,name)) return null;
  const info = JSON.parse(docker(kind === 'container' ? ['inspect',name] : [kind,'inspect',name]))[0];
  assertOwner(info,config,kind);
  if(kind==='volume'&&info.Driver!=='local')throw new Error('Dot storage requires the local volume driver');
  if (kind === 'network' && (info.Driver!=='bridge'||info.Internal || info.Options?.['com.docker.network.bridge.enable_ip_masquerade'] !== 'false')) throw new Error('Dot network must use the dedicated bridge with outbound masquerading disabled');
  if (kind === 'container') {
    const expectedVolume = name === names.db ? names.postgres : names.attachments;
    const destination = name === names.db ? '/var/lib/postgresql/data' : '/var/lib/swr/attachments';
    if (info.Mounts?.length !== 1 || info.Mounts[0].Name !== expectedVolume || info.Mounts[0].Destination !== destination || info.Mounts[0].Type !== 'volume') throw new Error('Unexpected dot storage mount');
    if (Object.keys(info.NetworkSettings.Networks).length !== 1 || !info.NetworkSettings.Networks[names.network]) throw new Error('Unexpected dot container network');
    const ports = info.HostConfig.PortBindings ?? {};
    if (name === names.db && Object.keys(ports).length) throw new Error('Dot database must not publish a host port');
    if (name === names.web && (Object.keys(ports).length !== 1 || ports['3000/tcp']?.length !== 1 || ports['3000/tcp'][0].HostIp !== '127.0.0.1' || ports['3000/tcp'][0].HostPort !== String(names.port))) throw new Error('Unexpected dot web binding');
    const env = Object.fromEntries(info.Config.Env.map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
    if (name === names.db && (env.POSTGRES_DB !== names.database || env.POSTGRES_PASSWORD !== config.dbPassword)) throw new Error('Unexpected dot database settings');
    if (name === names.web && (env.DATABASE_URL !== databaseUrl(config) || env.JWT_SECRET !== config.jwtSecret || env.NODE_ENV !== 'production' || env.SWR_ATTACHMENT_ROOT !== destination || env.EMAIL_WEBHOOK_URL)) throw new Error('Unexpected dot app settings');
  }
  return info;
}
function protectRoot() {
  if (process.platform === 'win32') {
    const account = run('whoami',[]);
    run('icacls',[root,'/inheritance:r','/grant:r',`${account}:(OI)(CI)F`,'/Q']);
    for (const entry of fs.readdirSync(root,{withFileTypes:true})) if (entry.isFile()) run('icacls',[path.join(root,entry.name),'/inheritance:r','/grant:r',`${account}:F`,'/Q']);
  } else fs.chmodSync(root,0o700);
}
function save(name,value) { fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2)+'\n',{mode:0o600}); protectRoot(); }
function labels(config) { return ['--label',`${names.label}=dot-sim`,'--label',`${names.ownerLabel}=${config.ownerId}`]; }
function helper(config,script,args=[]) {
  return docker(['run','--rm','--pull=never','--name',`swrtracker-dot-sim-tools-${randomUUID()}`, ...labels(config),'--network',names.network,
    '-v',`${root}:/run/dot:ro`,'-e','DATABASE_URL','-e','SWR_DOT_BOOTSTRAP=1',names.checksImage,
    'node',...(script.endsWith('.ts')?['--import','tsx']:[]),script,...args], {...shellEnv,DATABASE_URL:databaseUrl(config)});
}
function resourceCheck(config,required=true) {
  for (const [kind,name] of [['network',names.network],['volume',names.postgres],['volume',names.attachments],['container',names.db]]) {
    if (!inspect(kind,name,config) && required) throw new Error(`Missing dot ${kind}; run setup`);
  }
  inspect('container',names.web,config);
  const network = inspect('network',names.network,config);
  for (const endpoint of Object.values(network?.Containers ?? {})) if (![names.db,names.web].includes(endpoint.Name)) throw new Error('Unknown container attached to dot network');
}
async function readyDb(config) {
  if (!inspect('container',names.db,config).State.Running) docker(['start',names.db]);
  for (let i=0;i<60;i++) {
    const result = spawnSync('docker',['exec',names.db,'pg_isready','-h','127.0.0.1','-U','postgres','-d',names.database],{env:shellEnv,stdio:'ignore',timeout:5000});
    if (result.status === 0) return;
    await delay(250);
  }
  throw new Error('Dot database did not become ready');
}
async function readyWeb(config) {
  for (let i=0;i<60;i++) {
    try { const response = await fetch(`${config.baseUrl}/login`,{redirect:'manual',signal:AbortSignal.timeout(1000)}); if (response.status === 200) return; } catch {}
    await delay(250);
  }
  throw new Error('Dot application did not become ready');
}
async function portAvailable() {
  await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(new Error('Dot loopback port is occupied')));server.listen(names.port,'127.0.0.1',()=>server.close(resolve));});
}
if(shellEnv.DOCKER_HOST)assertLocalDockerTarget(shellEnv.DOCKER_HOST);
const context=JSON.parse(docker(['context','inspect']))[0];
assertLocalDockerTarget(context?.Endpoints?.docker?.Host);
fs.mkdirSync(root,{recursive:true,mode:0o700});
const lockPath=path.join(root,'launcher.lock');
let lock;
try{lock=fs.openSync(lockPath,'wx',0o600);}catch{throw new Error('Another dot command is active or left an unresolved launcher.lock; inspect it locally before retrying');}
fs.writeFileSync(lock,`${process.pid}\n`);
process.on('exit',()=>{fs.closeSync(lock);fs.unlinkSync(lockPath);});
if (!fs.existsSync(settings)) {
  if (command !== 'setup') throw new Error('Dot runtime is not set up');
  for (const [kind,name] of [['container',names.db],['container',names.web],['network',names.network],['volume',names.postgres],['volume',names.attachments]]) if (exists(kind,name)) throw new Error('Existing dot resource without local ownership credentials; refusing adoption');
  if (fs.existsSync(root) && fs.readdirSync(root).some(name=>name!=='launcher.lock')) throw new Error('Refusing nonempty unrecognized local data directory');
  fs.mkdirSync(root,{recursive:true,mode:0o700}); protectRoot();
  const fresh = newRuntime(); save('runtime.json',fresh); save('credentials.json',newPopulation(fresh));
}
const config = validateRuntime(JSON.parse(fs.readFileSync(settings,'utf8')));
validatePopulation(JSON.parse(fs.readFileSync(credentials,'utf8')),config);
resourceCheck(config,false);
if (command === 'setup') {
  console.log('Building dedicated dot app/check images; production Dockerfile runs TypeScript, tests and build.');
  // Keep detailed build output beneath the private local directory.
  for (const [tag,target] of [[names.appImage,null],[names.checksImage,'builder']]) {
    const args=['build','--progress=plain','-t',tag,...(target?['--target',target]:[]),'.'];
    const result=spawnSync('docker',args,{env:shellEnv,cwd:checkout,encoding:'utf8',timeout:600000,maxBuffer:32*1024*1024});
    fs.writeFileSync(path.join(root,`build-${target ?? 'app'}.log`),(result.stdout??'')+(result.stderr??''),{mode:0o600});
    if(result.status!==0)throw new Error('Dot image build failed; see private build log');
  }
  if (!inspect('network',names.network,config)) docker(['network','create','--driver','bridge','--opt','com.docker.network.bridge.enable_ip_masquerade=false',...labels(config),names.network]);
  for (const name of [names.postgres,names.attachments]) if (!inspect('volume',name,config)) docker(['volume','create',...labels(config),name]);
  if (!inspect('container',names.db,config)) docker(['run','-d','--name',names.db,...labels(config),'--network',names.network,
    '-e','POSTGRES_PASSWORD','-e',`POSTGRES_DB=${names.database}`,'-v',`${names.postgres}:/var/lib/postgresql/data`,'postgres:15-alpine'],{...shellEnv,POSTGRES_PASSWORD:config.dbPassword});
  resourceCheck(config); await readyDb(config);
  helper(config,'scripts/dot-sim/bootstrap.mjs',['claim']);
  helper(config,'db/migrate.ts');
  helper(config,'scripts/dot-sim/bootstrap.mjs',['seed']);
  helper(config,'scripts/dot-sim/bootstrap.mjs',['verify']);
  fs.writeFileSync(path.join(root,'ACCESS.md'),`# DOT SIM local access\n\nURL: ${config.baseUrl}/login\n\nSynthetic tenant: ${config.tenantId}\n\nIndividual generated credentials: credentials.json. Never share runtime.json or credentials.json.\n`,{mode:0o600});
  protectRoot(); console.log('Dot identities ready; projects and workflow remain unseeded. Run start, then smoke.');
} else if (command === 'status') {
  const db=inspect('container',names.db,config),web=inspect('container',names.web,config);
  if(db?.State.Running) helper(config,'scripts/dot-sim/bootstrap.mjs',['verify']);
  console.log(JSON.stringify({ownerId:config.ownerId,database:db?.State.Status ?? 'missing',web:web?.State.Status ?? 'missing',baseUrl:config.baseUrl}));
} else if (command === 'stop') {
  resourceCheck(config);
  if(inspect('container',names.db,config).State.Running) helper(config,'scripts/dot-sim/bootstrap.mjs',['verify']);
  for(const name of [names.web,names.db]) if(inspect('container',name,config)?.State.Running)docker(['stop',name]);
  console.log('Owned dot containers stopped; all data and volumes retained.');
} else if (command === 'recreate-web') {
  if(process.env.SWR_DOT_RECREATE_WEB!=='1')throw new Error('SWR_DOT_RECREATE_WEB=1 is required');
  resourceCheck(config); await readyDb(config); helper(config,'scripts/dot-sim/bootstrap.mjs',['verify']);
  if(inspect('container',names.web,config)){docker(['stop',names.web]);docker(['rm',names.web]);}
  console.log('Verified dot web container removed; attachment/database volumes retained. Run start.');
} else {
  resourceCheck(config); await readyDb(config); helper(config,'scripts/dot-sim/bootstrap.mjs',['verify']);
  if(command==='start') {
    const imageId=docker(['image','inspect',names.appImage,'--format','{{.Id}}']);
    const existing=inspect('container',names.web,config);
    if(existing && existing.Image!==imageId)throw new Error('Dot image changed; use guarded recreate-web, then start');
    if(!existing) { await portAvailable(); docker(['run','-d','--pull=never','--name',names.web,...labels(config),'--network',names.network,
      '-p',`127.0.0.1:${names.port}:3000`,'-e','DATABASE_URL','-e','JWT_SECRET','-e','NEXT_TELEMETRY_DISABLED=1',
      '-e','SWR_ATTACHMENT_ROOT=/var/lib/swr/attachments','-v',`${names.attachments}:/var/lib/swr/attachments`,names.appImage],
      {...shellEnv,DATABASE_URL:databaseUrl(config),JWT_SECRET:config.jwtSecret});
    } else if(!existing.State.Running)docker(['start',names.web]);
    await readyWeb(config); resourceCheck(config); console.log(`Dot simulation: ${config.baseUrl}/login`);
  } else {
    if(!inspect('container',names.web,config)?.State.Running)throw new Error('Start the dot application before smoke');
    if(inspect('container',names.web,config).Image!==docker(['image','inspect',names.appImage,'--format','{{.Id}}']))throw new Error('Dot smoke refuses a stale app image; use guarded recreate-web, then start');
    await readyWeb(config);
    console.log(run(process.execPath,[command==='smoke-invitations'?'scripts/dot-sim/invitation-smoke.mjs':'scripts/dot-sim/smoke.mjs'],shellEnv));
    const evidence=JSON.parse(helper(config,'scripts/dot-sim/bootstrap.mjs',['evidence']));
    const {verifyEvidence}=await import('./dot-sim/evidence.mjs');
    verifyEvidence(evidence,JSON.parse(fs.readFileSync(path.join(root,'last-run.json'),'utf8')),JSON.parse(fs.readFileSync(credentials,'utf8')));
    if(command==='smoke-invitations'){const {verifyInvitationEvidence}=await import('./dot-sim/evidence.mjs');verifyInvitationEvidence(evidence,JSON.parse(fs.readFileSync(path.join(root,'last-invitation-run.json'),'utf8')),JSON.parse(fs.readFileSync(credentials,'utf8')));}
    save('evidence.json',evidence); console.log('Authoritative audit/identity evidence reconciled.');
  }
}
