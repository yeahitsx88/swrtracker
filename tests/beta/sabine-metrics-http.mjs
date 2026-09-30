// Opt-in, read-only acceptance against the local Sabine preview. Never logs credentials.
import fs from 'node:fs';
import assert from 'node:assert/strict';
if (process.env.SWR_SABINE_METRICS !== '1') throw new Error('SWR_SABINE_METRICS=1 required');
const config = JSON.parse(fs.readFileSync('.data/sabine/runtime.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('.data/sabine/manifest.json', 'utf8'));
const base = 'http://127.0.0.1:3106';
let checks = 0;
let managerMetrics;
const terminal = new Set(['COMPLETED', 'REJECTED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED', 'DRAFT']);
for (const account of ['manager', 'super1', 'chief1', 'im1.1', 'requester0', 'admin']) {
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId: manifest.tenantId, email: `${account}@sabine.example`, password: config.SABINE_PASSWORD }) });
  assert.equal(login.status, 200); checks++;
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const get = path => fetch(`${base}${path}`, { headers: { cookie } });
  const path = `/api/projects/${manifest.liveProjectId}/metrics`;
  const response = await get(path);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); checks += 2;
  const { metrics } = await response.json();
  assert.equal(metrics.charts, undefined); checks++;
  const chartResponse = await get(`${path}?view=charts`).then(r => r.json());
  assert.equal(chartResponse.metrics.charts.areas.reduce((sum,b) => sum+b.count,0), metrics.total);
  assert.equal(chartResponse.metrics.charts.cells.reduce((sum,b) => sum+b.count,0), metrics.total); checks += 2;
  if (['requester0','im1.1','admin'].includes(account)) {
    assert.deepEqual(chartResponse.metrics.charts.crews, []);
    assert.deepEqual(chartResponse.metrics.charts.facets.instrumentMen, []); checks += 2;
  }
  if (account === 'manager') managerMetrics = metrics;
  // Sabine admin is also TENANT_ADMIN, which retains the documented read-only
  // project-health permission. Configuration-only Project Admin denial is unit-tested.
  if (account === 'admin') { assert.deepEqual(metrics, managerMetrics); checks++; continue; }
  const list = await get(`/api/tickets?projectId=${manifest.liveProjectId}&limit=200`).then(r => r.json());
  assert.ok(list.total <= 200, 'Fixture outgrew bounded acceptance; add paging to this test'); checks++;
  const open = list.data.filter(ticket => !terminal.has(ticket.status));
  assert.equal(metrics.openTotal, open.length);
  assert.equal(metrics.completedTotal, list.data.filter(ticket => ticket.status === 'COMPLETED').length);
  assert.equal(metrics.approvedWithoutInstrumentMan, list.data.filter(ticket => ticket.status === 'APPROVED' && !ticket.assignedInstrumentManId).length);
  assert.equal(metrics.openByAreaStatus.reduce((total, row) => total + row.count, 0), open.length); checks += 4;
  const spoofed = await get(`${path}?actorRole=SURVEY_MANAGER&companyId=00000000-0000-4000-8000-000000000000`);
  assert.equal(spoofed.status, 400); checks++;
  const completed = await get(`${path}?population=completed`).then(r => r.json());
  assert.equal(completed.metrics.openTotal, 0); assert.equal(completed.metrics.completedTotal, metrics.completedTotal); checks += 2;
  const combinations=[{population:'all',dateBasis:'needBy',dateFrom:'2020-01-01',dateTo:'2030-12-31'}, {population:'completed',dateBasis:'completed',dateFrom:'2020-01-01',dateTo:'2030-12-31'}];
  if (chartResponse.analytics.personnelFilters && chartResponse.metrics.charts.facets.crews[0]) combinations.push({population:'all',crewId:chartResponse.metrics.charts.facets.crews[0].key});
  for(const filters of combinations) {
    const filtered=await get(`${path}?${new URLSearchParams(filters)}`).then(r=>r.json());
    const {population,...rest}=filters;
    const details=await get(`/api/tickets?${new URLSearchParams({...rest,queue:population,projectId:manifest.liveProjectId,limit:'10'})}`).then(r=>r.json());
    assert.equal(details.total,filtered.metrics.total); assert.ok(details.data.length<=10); checks+=2;
  }
  for (const query of ['dateFrom=2024-02-30', 'dateFrom=2024-02-29&dateTo=2024-01-01', 'population=bad', 'status=DRAFT', 'status=COMPLETED&status=SUBMITTED']) {
    assert.equal((await get(`${path}?${query}`)).status, 400); checks++;
  }
  const personnel = await get(`${path}?crewId=00000000-0000-4000-8000-000000000000`);
  if (['requester0', 'im1.1'].includes(account)) { assert.equal(personnel.status, 403); checks++; }
  else { assert.equal(personnel.status, 200); assert.equal((await personnel.json()).metrics.openTotal, 0); checks += 2; }
  assert.equal((await get('/api/projects/00000000-0000-4000-8000-000000000000/metrics')).status, 403);
  assert.equal((await get('/api/projects/invalid/metrics')).status, 400); checks += 2;
  const historical = await get(`/api/projects/${manifest.historyProjectId}/metrics`).then(r => r.json());
  assert.equal(historical.metrics.openTotal, 33);
  assert.equal(historical.metrics.completedTotal, 19260); checks += 2;
  assert.equal(historical.metrics.coverage.syntheticCompletions, 4754); checks++;
  if (account === 'manager') {
    const start = performance.now();
    const chartHistory = await get(`/api/projects/${manifest.historyProjectId}/metrics?view=charts`);
    const payload = await chartHistory.text();
    const historicalCharts = JSON.parse(payload).metrics;
    assert.equal(historicalCharts.charts.statuses.reduce((sum,b) => sum+b.count,0), 20025);
    assert.ok(historicalCharts.coverage.cycleSamples <= 19260-4754); checks += 2;
    console.log(JSON.stringify({ historicalChartBytes: Buffer.byteLength(payload), historicalChartMs: Math.round(performance.now()-start), cycleSamples: historicalCharts.coverage.cycleSamples }));
  }
}
assert.equal((await fetch(`${base}/api/projects/${manifest.liveProjectId}/metrics`)).status, 401); checks++;
console.log(`Scoped metrics HTTP acceptance: ${checks} checks passed; six accounts; no record mutations.`);
