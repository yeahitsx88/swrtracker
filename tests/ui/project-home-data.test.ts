import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProjectHome, homeDateWindow, HOME_STATUSES, type HomeReader } from '@/lib/project-home-data';
import type { ProjectCapabilities } from '@/lib/contracts/account-offboarding';
import type { TicketQueryFilters } from '@/modules/ticket/application/query-filters';
import { homeRequestFilters } from '@/lib/home-request-filters';

function fixture(role: ProjectCapabilities['operationalRole'], canAdminister = false) {
  const calls: Array<{id: string; limit: number; filters: TicketQueryFilters}> = [];
  let metricsCalls = 0;
  const reader: HomeReader = {
    async listTickets(id, limit, offset, filters) {
      calls.push({id,limit,filters});
      assert.equal(offset, 0);
      return {data: [], total: filters.status === 'SUBMITTED' ? 7 : 3, limit, offset};
    },
    async getKpiCharts() { metricsCalls++; return {metrics: {openTotal: 3, openByAreaStatus: [], approvedWithoutInstrumentMan: 0, overdueNeedBy: 0, completedTotal: 3, averageSubmissionToCompletionHours: null}}; },
  };
  const capabilities: ProjectCapabilities = {operationalRole: role, canAdminister, centralIT: false, accessDisabled: false};
  return {calls, reader, capabilities, metricsCalls: () => metricsCalls};
}
test('Home uses bounded server populations rather than loaded records for totals', async () => {
  const f = fixture('REQUESTER');
  const result = await loadProjectHome('authorized-project',f.capabilities,new Date('2026-12-31T23:30:00Z'),f.reader);
  assert.equal(result.awaiting,7);
  assert.equal(result.recent.data.length,0);
  assert.equal(result.recent.total,3);
  assert.equal(f.metricsCalls(),1);
  assert.ok(f.calls.every(call => call.id === 'authorized-project' && call.limit <= 5));
  assert.deepEqual(f.calls.find(call => call.filters.dateFrom)?.filters,{queue:'open',dateBasis:'needBy',dateFrom:'2026-12-31',dateTo:'2027-01-03',sort:'operations'});
  assert.ok(f.calls.some(call => call.filters.status === 'DRAFT'));
});
test('combined operational and admin access uses authorized list totals without analytics escalation', async () => {
  const f = fixture('SURVEY_SUPERINTENDENT',true);
  const result = await loadProjectHome('scoped',f.capabilities,new Date(),f.reader);
  assert.equal(f.metricsCalls(),0);
  assert.equal(result.drafts,null);
  assert.deepEqual(result.metrics.charts?.statuses.map(row => row.key),HOME_STATUSES);
  assert.ok(f.calls.every(call => !call.filters.crewId && !call.filters.instrumentManId && !call.filters.cohort));
});
test('Party Chief obligations use the established approvals queue; Instrument Man receives no approval population', async () => {
  const chief=fixture('PARTY_CHIEF');
  await loadProjectHome('p',chief.capabilities,new Date(),chief.reader);
  assert.ok(chief.calls.some(call => call.filters.queue==='pcApprovals'));
  const instrument=fixture('INSTRUMENT_MAN');
  await loadProjectHome('p',instrument.capabilities,new Date(),instrument.reader);
  assert.ok(!instrument.calls.some(call => call.filters.queue==='pcApprovals'||call.filters.status==='DRAFT'));
});
test('no operational or disabled access does not issue request reads', async () => {
  for(const role of [null,'PROJECT_ADMIN','REQUESTER'] as const) {
    const f=fixture(role,true);
    if(role==='REQUESTER')f.capabilities.accessDisabled=true;
    await assert.rejects(loadProjectHome('p',f.capabilities,new Date(),f.reader),/active operational membership/);
    assert.equal(f.calls.length,0);
  }
});
test('Home surfaces failed authorized reads without substituting a different population', async () => {
  const f=fixture('REQUESTER');
  f.reader.getKpiCharts=async()=>{throw new Error('current access revoked');};
  await assert.rejects(loadProjectHome('p',f.capabilities,new Date(),f.reader),/current access revoked/);
});
test('UTC upcoming window crosses month/year boundaries', () => {
  assert.deepEqual(homeDateWindow(new Date('2026-12-31T23:59:59Z')),{today:'2026-12-31',through:'2027-01-03'});
});
test('Home drill-downs retain matching queues and dates, and malformed scope is rejected', () => {
  assert.deepEqual(homeRequestFilters('queue=completed&view=requests').filters,{queue:'completed'});
  assert.deepEqual(homeRequestFilters('').filters,{queue:'all'});
  assert.deepEqual(homeRequestFilters('status=COMPLETED&queue=all','fieldWork').filters,{queue:'all',status:'COMPLETED'});
  assert.ok(homeRequestFilters('status=UNSUPPORTED').error);
  assert.ok(homeRequestFilters('areaId=foreign-not-a-uuid').error);
  assert.ok(homeRequestFilters('dateFrom=2026-10-05&dateTo=2026-10-03').error);
});
