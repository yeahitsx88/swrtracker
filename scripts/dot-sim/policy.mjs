import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function assertLocalDockerTarget(value) {
  if (typeof value !== 'string' || !(value.startsWith('npipe:////./pipe/') || value.startsWith('unix:///'))) throw new Error('Dot runtime requires a local Docker socket; remote Docker targets are refused');
}
export function assertDataRoot(checkout,root) {
  const expected=path.join(path.resolve(checkout),'.data','dot-sim');
  if(path.resolve(root)!==expected)throw new Error('Unexpected dot local data directory');
  for(const candidate of [path.join(checkout,'.data'),root]) {
    if(fs.existsSync(candidate)&&fs.realpathSync(candidate)!==path.resolve(candidate))throw new Error('Dot data directory must not redirect to another environment');
  }
  for(const name of ['runtime.json','credentials.json']) {
    const candidate=path.join(root,name);
    if(fs.existsSync(candidate)&&!fs.lstatSync(candidate).isFile())throw new Error('Dot local configuration must be a regular file');
  }
}

export const names = Object.freeze({
  db: 'swrtracker-dot-sim-db', web: 'swrtracker-dot-sim-web',
  network: 'swrtracker-dot-sim-network', database: 'swr_dot_simulation',
  postgres: 'swrtracker-dot-sim-postgres', attachments: 'swrtracker-dot-sim-attachments',
  appImage: 'swrtracker:dot-sim', checksImage: 'swrtracker:dot-sim-checks',
  port: 3118, label: 'swrtracker.simulation', ownerLabel: 'swrtracker.dot.owner',
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateRuntime(config) {
  if (config?.schema !== 1 || !uuid.test(config.ownerId ?? '') || !uuid.test(config.tenantId ?? '') ||
      !uuid.test(config.controlTenantId ?? '') || !/^[a-f0-9]{64}$/.test(config.dbPassword ?? '') ||
      !/^[a-f0-9]{128}$/.test(config.jwtSecret ?? '') || config.baseUrl !== `http://127.0.0.1:${names.port}`) {
    throw new Error('Unexpected dot runtime configuration');
  }
  return config;
}
export function databaseUrl(config) {
  validateRuntime(config);
  return `postgresql://postgres:${config.dbPassword}@${names.db}:5432/${names.database}`;
}
export function assertDatabaseTarget(value, guard) {
  const url = new URL(value);
  if (guard !== '1' || url.protocol !== 'postgresql:' || url.hostname !== names.db ||
      url.port !== '5432' || url.pathname !== `/${names.database}` || url.username !== 'postgres' ||
      !/^[a-f0-9]{64}$/.test(url.password) || url.search || url.hash) {
    throw new Error('Refusing non-dot or unguarded database target');
  }
}
export function assertDatabaseMarker(rows,config) {
  validateRuntime(config);
  if (rows.length !== 1 || rows[0].owner_id !== config.ownerId || rows[0].kind !== 'dot-sim' || rows[0].version !== 1 || rows[0].tenant_id !== config.tenantId) throw new Error('Refusing unexpected database ownership marker');
}
export function assertOwner(info, config, kind) {
  validateRuntime(config);
  const labels = kind === 'container' ? info?.Config?.Labels : info?.Labels;
  if (labels?.[names.label] !== 'dot-sim' || labels?.[names.ownerLabel] !== config.ownerId) {
    throw new Error(`Dot ${kind} ownership mismatch`);
  }
}
export function assertLocalBase(value) {
  const url = new URL(value);
  if (url.origin !== `http://127.0.0.1:${names.port}` || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('Only the dot loopback HTTP origin is allowed');
  return url.origin;
}
export function newRuntime() {
  return validateRuntime({schema: 1, ownerId: randomUUID(), tenantId: randomUUID(), controlTenantId: randomUUID(),
    baseUrl: `http://127.0.0.1:${names.port}`, dbPassword: randomBytes(32).toString('hex'), jwtSecret: randomBytes(64).toString('hex')});
}
export function newPopulation(config) {
  validateRuntime(config);
  const company = (key, type, tenantId = config.tenantId) => ({key, id: randomUUID(), type, tenantId, name: `DOT SIM Synthetic ${key}`});
  const companies = [company('gc', 'GC'), company('sub', 'SUBCONTRACTOR'), company('owner', 'OWNER_REP'), company('control', 'GC', config.controlTenantId)];
  const person = (key, role, companyKey = 'gc') => {
    const c = companies.find(x => x.key === companyKey);
    return {key, id: randomUUID(), tenantId: c.tenantId, companyId: c.id, name: `DOT SIM ${key}`,
      email: `${key}@dot-sim.example.invalid`, password: randomBytes(24).toString('base64url'), role};
  };
  return {schema: 1, ownerId: config.ownerId, companies, actors: [
    person('central-it', 'TENANT_ADMIN'), person('project-admin', 'PROJECT_ADMIN'), person('manager', 'SURVEY_MANAGER'),
    person('superintendent', 'SURVEY_SUPERINTENDENT'), person('chief-1', 'PARTY_CHIEF'), person('chief-2', 'PARTY_CHIEF'),
    ...[1,2,3,4].map(n => person(`instrument-${n}`, 'INSTRUMENT_MAN')),
    person('requester-1', 'REQUESTER'), person('requester-2', 'REQUESTER'), person('sub-requester', 'REQUESTER', 'sub'),
    person('owner-witness', 'REQUESTER', 'owner'), person('disabled-control', 'REQUESTER'), person('foreign-control', 'TENANT_ADMIN', 'control'),
  ]};
}
export function validatePopulation(population, config) {
  validateRuntime(config);
  if (population?.schema !== 1 || population.ownerId !== config.ownerId || population.actors?.length !== 16 || population.companies?.length !== 4) throw new Error('Unexpected dot population');
  const expectedRoles = {'central-it':'TENANT_ADMIN','project-admin':'PROJECT_ADMIN',manager:'SURVEY_MANAGER',superintendent:'SURVEY_SUPERINTENDENT',
    'chief-1':'PARTY_CHIEF','chief-2':'PARTY_CHIEF',...Object.fromEntries([1,2,3,4].map(n=>[`instrument-${n}`,'INSTRUMENT_MAN'])),
    'requester-1':'REQUESTER','requester-2':'REQUESTER','sub-requester':'REQUESTER','owner-witness':'REQUESTER','disabled-control':'REQUESTER','foreign-control':'TENANT_ADMIN'};
  const expectedCompanies={gc:'GC',sub:'SUBCONTRACTOR',owner:'OWNER_REP',control:'GC'};
  if(new Set(population.companies.map(c=>c.key)).size!==4||new Set(population.actors.map(a=>a.key)).size!==16)throw new Error('Duplicate dot population key');
  const seen = new Set();
  for (const company of population.companies) {
    if (!uuid.test(company.id) || ![config.tenantId,config.controlTenantId].includes(company.tenantId) ||
        expectedCompanies[company.key] !== company.type || company.tenantId !== (company.key==='control'?config.controlTenantId:config.tenantId) || company.name !== 'DOT SIM Synthetic '+company.key) throw new Error('Non-synthetic dot company');
  }
  for (const actor of population.actors) {
    const companyKey=actor.key==='sub-requester'?'sub':actor.key==='owner-witness'?'owner':actor.key==='foreign-control'?'control':'gc';
    if (expectedRoles[actor.key]!==actor.role || !population.companies.some(c=>c.key===companyKey&&c.id===actor.companyId) || !uuid.test(actor.id) || seen.has(actor.id) || !/^[a-z0-9-]+@dot-sim\.example\.invalid$/.test(actor.email) ||
        !actor.name.startsWith('DOT SIM ') || !/^[A-Za-z0-9_-]{32}$/.test(actor.password) ||
        !population.companies.some(c => c.id === actor.companyId && c.tenantId === actor.tenantId)) throw new Error('Non-synthetic dot account');
    seen.add(actor.id);
  }
  if (new Set(population.actors.map(a => a.password)).size !== population.actors.length) throw new Error('Actor passwords must be independent');
  return population;
}
