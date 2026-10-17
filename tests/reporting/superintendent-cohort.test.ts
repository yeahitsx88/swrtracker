import test from 'node:test';
import assert from 'node:assert/strict';
import { readSuperintendentCrews } from '@/modules/tenancy/application/read-superintendent-crews';
import { SuperintendentCrewsPgRepository } from '@/modules/tenancy/infrastructure/superintendent-crews.repository';
import { getAmeliaMetrics } from '@/modules/reporting/application/amelia-metrics';
import { AmeliaMetricsReader, buildMetricsQuery } from '@/modules/reporting/infrastructure/amelia-metrics.reader';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { buildVisibilityClause, assertVisibilityCohort } from '@/lib/ticket-visibility-clause';
import { resolveVisibility } from '@/lib/resolve-visibility';
import { parseMetricsQuery } from '@/lib/metrics-query';
import { parseTicketListQuery } from '@/lib/ticket-list-query';
import type { DbClient, UUID } from '@/shared/types';
import type { VisibilityScope } from '@/modules/ticket/application/ports';

const id=(n:number)=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenant=id(1),project=id(2),sup=id(3),area=id(4),chief=id(5),company=id(6);
const pairs=[{partyChiefId:chief,areaId:area}];
const visibility:VisibilityScope={actorId:sup,actorRole:'SURVEY_SUPERINTENDENT',projectId:project,companyId:company,companyType:'GC',aorNodeIds:[area]};
const noQuery:DbClient={async query(){throw new Error('Must reject before SQL');}};

test('linked crew application rejects other roles and skips empty Area authorization',async()=>{
  const repo={async linkedCrewAreas(){throw new Error('Must not resolve links');}};
  await assert.rejects(readSuperintendentCrews(repo,noQuery,{tenantId:tenant,projectId:project,actorId:sup,actorRole:'PARTY_CHIEF',authorizedAreaIds:[area]}),{name:'ForbiddenError'});
  assert.deepEqual(await readSuperintendentCrews(repo,noQuery,{tenantId:tenant,projectId:project,actorId:sup,actorRole:'SURVEY_SUPERINTENDENT',authorizedAreaIds:[]}),[]);
});
test('linked crew application passes only current server-resolved identity and Areas',async()=>{
  const repo={async linkedCrewAreas(...args:unknown[]){assert.deepEqual(args,[noQuery,tenant,project,sup,[area]]);return pairs;}};
  assert.deepEqual(await readSuperintendentCrews(repo,noQuery,{tenantId:tenant,projectId:project,actorId:sup,actorRole:'SURVEY_SUPERINTENDENT',authorizedAreaIds:[area]}),pairs);
});
test('reporting link SQL uses explicit active links and active fixed-role tenant members, not named teams',async()=>{
  const db:DbClient={async query<T extends object>(sql:string,params?:unknown[]){
    assert.deepEqual(params,[tenant,project,sup,[area]]);
    for(const fence of ["rl.tenant_id=$1 AND rl.project_id=$2",'rl.superintendent_id=$3 AND rl.deactivated_at IS NULL',"pc.role='PARTY_CHIEF'","sp.role='SURVEY_SUPERINTENDENT'",'cu.deactivated_at IS NULL','su.deactivated_at IS NULL','n.retired_at IS NULL','child.tenant_id=$1 AND child.project_id=$2','area_id=ANY($4::uuid[])'])assert.ok(sql.includes(fence),fence);
    assert.ok(!sql.includes('survey_team'));assert.ok(!sql.includes('tickets'));
    return{rows:pairs as T[]};
  }};
  assert.deepEqual(await new SuperintendentCrewsPgRepository().linkedCrewAreas(db,tenant,project,sup,[area]),pairs);
});
test('linked cohort predicate binds each chief to its linked Area and preserves company intersection',()=>{
  const clause=buildVisibilityClause({...visibility,linkedCrewAssignments:pairs,companyType:'SUBCONTRACTOR'},5);
  assert.ok(clause.sql.includes('t.aor_node_id IN ($5)'));assert.ok(clause.sql.includes('jsonb_to_recordset($6::jsonb)'));
  assert.ok(clause.sql.includes('crew."partyChiefId"=t.assigned_party_chief_id AND crew."areaId"=t.aor_node_id'));
  assert.ok(clause.sql.includes('AND t.company_id = $8'));
  assert.deepEqual(clause.params,[area,JSON.stringify(pairs),sup,company]);
});
test('empty links or missing Areas fail closed; Area-wide requests need no chief assignment',()=>{
  for(const scope of [{...visibility,linkedCrewAssignments:[]},{...visibility,aorNodeIds:[],linkedCrewAssignments:pairs}])assert.equal(buildVisibilityClause(scope,3).sql,'AND t.draft_deleted_at IS NULL AND 1 = 0');
  const areaWide=buildVisibilityClause(visibility,3);assert.match(areaWide.sql,/t.aor_node_id IN \(\$3\)/);assert.match(areaWide.sql,/FROM survey_team_members/);assert.match(areaWide.sql,/st.lead_user_id=\$4/);assert.deepEqual(areaWide.params,[area,sup]);
});
test('cohort invariant rejects mismatched fences and other roles',()=>{
  assertVisibilityCohort(visibility,'areaWorkload');assertVisibilityCohort({...visibility,linkedCrewAssignments:[]},'linkedCrews');
  for(const [scope,cohort] of [[visibility,'linkedCrews'],[{...visibility,linkedCrewAssignments:pairs},'areaWorkload'],[{...visibility,actorRole:'PARTY_CHIEF'},'areaWorkload'],[{...visibility,actorRole:'REQUESTER',linkedCrewAssignments:pairs},'linkedCrews']] as const){
    assert.throws(()=>assertVisibilityCohort(scope,cohort),{name:'ForbiddenError'});
  }
});
test('ticket repository denies unresolved linked population before count or page query',async()=>{
  await assert.rejects(new TicketRepository().list(noQuery,tenant,{projectId:project,visibility,filters:{cohort:'linkedCrews'},limit:10,offset:0}),{name:'ForbiddenError'});
});
test('metrics deny a forged or unresolved cohort before querying',async()=>{
  for(const scope of [visibility,{...visibility,actorRole:'REQUESTER' as const,linkedCrewAssignments:pairs}])await assert.rejects(getAmeliaMetrics(new AmeliaMetricsReader(),noQuery,{tenantId:tenant,projectId:project,visibility:scope,filters:{cohort:'linkedCrews'}}),{name:'ForbiddenError'});
});
test('linked Superintendent personnel charts are allowed only within resolved linked scope',async()=>{
  const scoped={...visibility,linkedCrewAssignments:pairs};
  const {sql,params}=buildMetricsQuery({tenantId:tenant,projectId:project,visibility:scoped,includeCharts:true,filters:{cohort:'linkedCrews',crewId:chief}});
  assert.ok(sql.includes('jsonb_to_recordset'));assert.ok(sql.includes('LEFT JOIN users'));
  assert.ok(sql.includes('FROM authorized'));assert.ok(sql.includes('FROM measured'));
  assert.ok(params.includes(JSON.stringify(pairs)));assert.ok(params.includes(chief));
  const db:DbClient={async query<T extends object>(){return{rows:[{metrics:{openTotal:0,openByAreaStatus:[],approvedWithoutInstrumentMan:0,overdueNeedBy:0,completedTotal:0,averageSubmissionToCompletionHours:null}}] as T[]};}};
  await getAmeliaMetrics(new AmeliaMetricsReader(),db,{tenantId:tenant,projectId:project,visibility:scoped,filters:{cohort:'linkedCrews',crewId:chief}});
  await assert.rejects(getAmeliaMetrics(new AmeliaMetricsReader(),noQuery,{tenantId:tenant,projectId:project,visibility:{...visibility,linkedCrewAssignments:[]},filters:{cohort:'linkedCrews',crewId:chief}}),{name:'ForbiddenError'});
});
test('both query parsers whitelist exactly two cohorts and reject duplicates',()=>{
  for(const cohort of ['areaWorkload','linkedCrews']){
    assert.equal(parseMetricsQuery(new URLSearchParams({cohort})).cohort,cohort);
    assert.equal(parseTicketListQuery(new URLSearchParams({cohort})).filters.cohort,cohort);
  }
  for(const query of ['cohort=all','cohort=','cohort=linkedCrews&cohort=areaWorkload'])for(const parse of [parseMetricsQuery,parseTicketListQuery])assert.throws(()=>parse(new URLSearchParams(query)),{name:'ValidationError'});
});
test('visibility resolver denies non-Superintendent cohort selection before SQL',async()=>{
  for(const role of ['SURVEY_MANAGER','REQUESTER','PARTY_CHIEF','INSTRUMENT_MAN','AREA_VIEWER'] as const)await assert.rejects(resolveVisibility(noQuery,tenant,project,sup,role,'linkedCrews'),{name:'ForbiddenError'});
});
