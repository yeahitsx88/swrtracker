// Device-local simulation only. Never connects to an inherited DATABASE_URL.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve('.data/sabine');
const settings = path.join(root, 'runtime.json');
const container = 'swrtracker-sabine-simulation';
const webContainer = 'swrtracker-sabine-web';
const network = 'swrtracker-sabine-network';
const image = 'swrtracker:sabine-linux';
const label = 'swrtracker.simulation=sabine';
const command = process.argv[2];
if (!['setup', 'start', 'stop'].includes(command)) throw new Error('Expected setup, start, or stop');
function run(exe, args, env = process.env) {
  const r = spawnSync(exe, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new Error(`${exe} failed: ${r.stderr || r.error || 'unknown error'}`);
  return r.stdout.trim();
}
function inspect(name = container) {
  const names = run('docker', ['ps', '-a', '--format', '{{.Names}}']).split(/\r?\n/);
  if (!names.includes(name)) return null;
  const info = JSON.parse(run('docker', ['inspect', name]))[0];
  if (info.Config.Labels?.['swrtracker.simulation'] !== 'sabine') throw new Error('Container ownership mismatch');
  return info;
}
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
// Windows ignores POSIX modes: explicitly restrict this simulation directory.
if (process.platform === 'win32') {
  const account = run('whoami', []);
  run('icacls', [root, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`, '/Q']);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile()) run('icacls', [path.join(root, entry.name), '/inheritance:r', '/grant:r', `${account}:F`, '/Q']);
  }
}
if (command === 'stop') {
  if (inspect(webContainer)?.State.Running) run('docker', ['stop', webContainer]);
  if (inspect()?.State.Running) run('docker', ['stop', container]);
  console.log('Sabine web and database stopped; persistent volumes retained.');
  process.exit(0);
}
if (!fs.existsSync(settings)) {
  if (inspect()) throw new Error('Existing container has no local credentials; refusing to replace it');
  const dbPassword = randomBytes(32).toString('hex');
  fs.writeFileSync(settings, JSON.stringify({
    DATABASE_URL: `postgresql://postgres:${dbPassword}@127.0.0.1:15488/swr_sabine_simulation`,
    JWT_SECRET: randomBytes(64).toString('hex'),
    SABINE_PASSWORD: randomBytes(18).toString('base64url'),
    POSTGRES_PASSWORD: dbPassword,
    SWR_ATTACHMENT_ROOT: path.join(root, 'attachments'),
  }, null, 2), { mode: 0o600, flag: 'wx' });
}
const config = JSON.parse(fs.readFileSync(settings, 'utf8'));
const configuredUrl = new URL(config.DATABASE_URL);
if (configuredUrl.hostname !== '127.0.0.1' || configuredUrl.pathname !== '/swr_sabine_simulation') throw new Error('Unexpected local database configuration');
if (configuredUrl.port === '55488') {
  if (inspect()) throw new Error('Remove only the verified never-started container before changing its blocked port');
  configuredUrl.port = '15488';
  config.DATABASE_URL = configuredUrl.toString();
  fs.writeFileSync(settings, JSON.stringify(config, null, 2), { mode: 0o600 });
}
if (configuredUrl.port !== '15488') throw new Error('Unexpected Sabine port');
const env = { ...process.env, ...config, NODE_ENV: 'production' };
if (!inspect()) {
  run('docker', ['run', '-d', '--name', container, '--label', label,
    '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=swr_sabine_simulation',
    '-p', '127.0.0.1:15488:5432',
    '-v', 'swrtracker-sabine-simulation-data:/var/lib/postgresql/data',
    'postgres:15-alpine'], env);
} else if (!inspect().State.Running) run('docker', ['start', container]);
let ready = false;
for (let i = 0; i < 30; i++) {
  const r = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'swr_sabine_simulation']);
  if (r.status === 0) { ready = true; break; }
  await delay(500);
}
if (!ready) throw new Error('Sabine database did not become ready');
if (command === 'setup') {
  console.log(run(process.execPath, ['--import', 'tsx', 'db/migrate.ts'], env));
  const seedOutput = run(process.execPath, ['--import', 'tsx', 'scripts/seed-sabine.ts'], env);
  console.log(seedOutput.split(/\r?\n/).at(-1));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'ACCESS.md'), `# Sabine local simulation\n\nOpen http://127.0.0.1:3106/login\n\nTenant ID: ${manifest.tenantId}\n\nPassword for the fictional demo accounts: ${config.SABINE_PASSWORD}\n\nStart with manager@sabine.example. Other accounts: super1 through super5@sabine.example; chief1 through chief42@sabine.example; im1.1 through im42.3@sabine.example; requester0@sabine.example; admin@sabine.example.\n\nChoose Sabine — live simulation to operate requests. The historical simulation project is read-only through VIEWER memberships. All completion analytics are demonstration data, not historical performance.\n\nThis is device-local and contains no real account credentials. Keep this access file local; do not share the separate runtime.json file, which contains infrastructure secrets.\n`, {mode:0o600});
} else {
  run('docker', ['image', 'inspect', image, '--format', '{{.Id}}']);
  const networks = run('docker', ['network', 'ls', '--format', '{{.Name}}']).split(/\r?\n/);
  if (!networks.includes(network)) run('docker', ['network', 'create', '--label', label, network]);
  const networkInfo = JSON.parse(run('docker', ['network', 'inspect', network]))[0];
  if (networkInfo.Labels?.['swrtracker.simulation'] !== 'sabine') throw new Error('Network ownership mismatch');
  if (!inspect().NetworkSettings.Networks[network]) run('docker', ['network', 'connect', network, container]);
  const nativeAttachments = path.join(root, 'attachments');
  if (fs.existsSync(nativeAttachments) && fs.readdirSync(nativeAttachments).length) {
    throw new Error('Native attachment storage is nonempty. Transfer and verify its bytes before switching runtimes.');
  }
  const linuxUrl = new URL(config.DATABASE_URL);
  linuxUrl.hostname = container; linuxUrl.port = '5432';
  const webEnv = { ...env, DATABASE_URL: linuxUrl.toString(), SWR_ATTACHMENT_ROOT: '/var/lib/swr/attachments' };
  if (!inspect(webContainer)) {
    run('docker', ['run', '-d', '--name', webContainer, '--label', label, '--network', network,
      '-p', '127.0.0.1:3106:3000', '-e', 'DATABASE_URL', '-e', 'JWT_SECRET', '-e', 'SWR_ATTACHMENT_ROOT',
      '-v', 'swrtracker-sabine-attachments:/var/lib/swr/attachments', image], webEnv);
  } else {
    const expectedImage = run('docker', ['image', 'inspect', image, '--format', '{{.Id}}']);
    if (inspect(webContainer).Image !== expectedImage) throw new Error('Web image changed. Recreate the labeled web container without removing its attachment volume.');
    if (!inspect(webContainer).State.Running) run('docker', ['start', webContainer]);
  }
  console.log('Sabine simulation: http://127.0.0.1:3106/login');
  console.log('Linux web container started. Local demo login details: .data/sabine/ACCESS.md');
}
