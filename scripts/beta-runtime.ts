import { randomBytes } from 'crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { assertSafeBetaResetRoot, betaBackupPath } from './beta-reset-policy';

const command = process.argv[2];
const root = path.join(process.cwd(), '.data', 'beta');
const dataDir = path.join(root, 'postgres');
const socketDir = path.join(root, 'socket');
const attachmentDir = path.join(root, 'attachments');
const envPath = path.join(root, 'beta.env');
const logPath = path.join(root, 'postgres.log');
const port = '55487';
const databaseName = 'swr_amelia_beta';

function findPgBin(): string {
  const candidates = [
    process.env.SWR_PG_BIN,
    '/opt/homebrew/opt/postgresql@15/bin',
    '/usr/local/opt/postgresql@15/bin',
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'pg_ctl'))) return candidate;
  }
  const found = spawnSync('which', ['pg_ctl'], { encoding: 'utf8' }).stdout.trim();
  if (found) return path.dirname(found);
  throw new Error('PostgreSQL 15 tools were not found. Set SWR_PG_BIN to the directory containing pg_ctl.');
}

function run(executable: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(executable, args, { cwd: process.cwd(), env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${path.basename(executable)} exited with status ${result.status ?? 'unknown'}`);
}

function isRunning(pgBin: string): boolean {
  return spawnSync(path.join(pgBin, 'pg_ctl'), ['-D', dataDir, 'status'], { stdio: 'ignore' }).status === 0;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function startDatabase(pgBin: string): void {
  if (isRunning(pgBin)) return;
  run(path.join(pgBin, 'pg_ctl'), [
    '-D', dataDir, '-l', logPath,
    '-o', `-c listen_addresses='' -c unix_socket_directories=${shellQuote(socketDir)} -p ${port}`,
    'start',
  ]);
}

function stopDatabase(pgBin: string): void {
  if (!existsSync(path.join(dataDir, 'PG_VERSION')) || !isRunning(pgBin)) return;
  run(path.join(pgBin, 'pg_ctl'), ['-D', dataDir, 'stop', '-m', 'fast']);
}

function databaseUrl(): string {
  return `postgresql://${encodeURIComponent(os.userInfo().username)}@localhost:${port}/${databaseName}?host=${encodeURIComponent(socketDir)}`;
}

function parseBetaEnv(): Record<string, string> {
  if (!existsSync(envPath)) throw new Error('Private beta is not set up. Run pnpm beta:setup first.');
  const values: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function readBetaEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ...parseBetaEnv() };
}

function ensureDatabase(pgBin: string, env: NodeJS.ProcessEnv): void {
  const psql = path.join(pgBin, 'psql');
  const result = spawnSync(psql, [
    '-h', socketDir, '-p', port, '-d', 'postgres', '-Atqc',
    `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`,
  ], { encoding: 'utf8', env });
  if (result.status !== 0) throw new Error(result.stderr || 'Unable to inspect beta database');
  if (result.stdout.trim() !== '1') {
    run(path.join(pgBin, 'createdb'), ['-h', socketDir, '-p', port, databaseName], env);
  }
}

function setup(): void {
  const pgBin = findPgBin();
  mkdirSync(root, { recursive: true });
  mkdirSync(socketDir, { recursive: true });
  mkdirSync(attachmentDir, { recursive: true });
  chmodSync(root, 0o700);
  chmodSync(socketDir, 0o700);
  chmodSync(attachmentDir, 0o700);
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    run(path.join(pgBin, 'initdb'), [
      '-D', dataDir,
      '--auth-local=peer',
      '--auth-host=reject',
      '--no-instructions',
    ]);
  }
  const existingEnv = existsSync(envPath) ? parseBetaEnv() : undefined;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl(),
    JWT_SECRET: existingEnv?.JWT_SECRET || randomBytes(64).toString('hex'),
    SWR_ATTACHMENT_ROOT: attachmentDir,
    NODE_ENV: 'development',
  };
  writeFileSync(envPath, [
    `DATABASE_URL=${env.DATABASE_URL}`,
    `JWT_SECRET=${env.JWT_SECRET}`,
    `SWR_ATTACHMENT_ROOT=${env.SWR_ATTACHMENT_ROOT}`,
    'NODE_ENV=development',
    '',
  ].join('\n'), { mode: 0o600 });
  chmodSync(envPath, 0o600);
  const databaseWasRunning = isRunning(pgBin);
  startDatabase(pgBin);
  try {
    ensureDatabase(pgBin, env);
    run(process.execPath, ['--import', 'tsx', 'db/migrate.ts'], env);
    run(process.execPath, ['--import', 'tsx', 'scripts/seed-amelia-beta.ts'], env);
  } finally {
    if (!databaseWasRunning) stopDatabase(pgBin);
  }
  console.log('\nAmelia private beta is ready. Run: pnpm beta:start');
}

function start(): void {
  const pgBin = findPgBin();
  const env = readBetaEnv();
  startDatabase(pgBin);
  console.log('\nAmelia private beta: http://127.0.0.1:3000');
  console.log('Sample password for every account: AmeliaBeta!2026');
  console.log('Accounts: lead, chief, instrument, requester, authority, admin @amelia.local\n');
  console.log('Tenant ID: 10000000-0000-4000-8000-000000000001');
  console.log('Project ID: 10000000-0000-4000-8000-000000000002\n');
  const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3000'], {
    cwd: process.cwd(), env, stdio: 'inherit',
  });
  let stopping = false;
  const stopRuntime = () => {
    if (stopping) return;
    stopping = true;
    stopDatabase(pgBin);
  };
  const requestShutdown = (signal: NodeJS.Signals) => {
    if (!next.killed) next.kill(signal);
  };
  process.once('SIGINT', () => requestShutdown('SIGINT'));
  process.once('SIGTERM', () => requestShutdown('SIGTERM'));
  next.once('error', (error) => {
    console.error(error);
    stopRuntime();
    process.exitCode = 1;
  });
  next.once('exit', (code) => {
    stopRuntime();
    process.exitCode = code ?? 0;
  });
}

function reset(): void {
  const pgBin = findPgBin();
  assertSafeBetaResetRoot(process.cwd(), root);
  if (existsSync(root)) {
    if (lstatSync(root).isSymbolicLink()) {
      throw new Error(`Refusing to reset a symbolic-link beta path: ${root}`);
    }
    stopDatabase(pgBin);
    const backupRoot = path.join(process.cwd(), '.data', 'beta-backups');
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    chmodSync(backupRoot, 0o700);
    const backupPath = betaBackupPath(process.cwd());
    if (existsSync(backupPath)) throw new Error(`Beta backup path already exists: ${backupPath}`);
    renameSync(root, backupPath);
    console.log(`Previous beta dataset backed up to ${backupPath}`);
  }
  setup();
}

if (command === 'setup') setup();
else if (command === 'start') start();
else if (command === 'stop') stopDatabase(findPgBin());
else if (command === 'reset') reset();
else throw new Error('Usage: beta-runtime.ts setup|start|stop|reset');
