import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pool } from 'pg';

const config = JSON.parse(fs.readFileSync('.data/sabine/runtime.json','utf8'));
const manifest = JSON.parse(fs.readFileSync('.data/sabine/manifest.json','utf8'));
const source = JSON.parse(fs.readFileSync('.data/sabine/snapshot.json','utf8'));
const url=new URL(config.DATABASE_URL);
assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.port,'15488'); assert.equal(url.pathname,'/swr_sabine_simulation');
assert.equal(source.crewCount,42); assert.equal(source.records.length,20199);
assert.equal(new Set(source.records.map(r=>r.sourceId)).size,20199);
const allowedKeys=['sourceId','area','type','sourceType','status','cad','crew','requester','reported','need','completed','generatedCompletion','generatedNeed'].sort();
for(const r of source.records) {
  assert.deepEqual(Object.keys(r).sort(),allowedKeys);
  assert.ok(!r.crew || (Number.isInteger(r.crew) && r.crew>=1 && r.crew<=42));
  if(r.completed) assert.ok(r.completed>=r.reported,'Completion predates request');
  assert.ok(!JSON.stringify(r).includes('@'),'Source email in sanitized record');
}
const pool=new Pool({connectionString:config.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:10000});
const request=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(10000)});
const q=async(sql,args=[]) => (await pool.query(sql,args)).rows;
try {
  const counts=await q('SELECT project_id,status,count(*)::int AS n FROM tickets WHERE tenant_id=$1 GROUP BY project_id,status',[manifest.tenantId]);
  assert.equal(counts.filter(r=>r.project_id===manifest.historyProjectId).reduce((n,r)=>n+r.n,0),20025);
  assert.equal(counts.filter(r=>r.project_id===manifest.liveProjectId).reduce((n,r)=>n+r.n,0),84);
  for(const s of ['SUBMITTED','RETURNED_FOR_CORRECTION','APPROVED','ASSIGNED','IN_PROGRESS','COMPLETED']) assert.equal(counts.find(r=>r.project_id===manifest.liveProjectId&&r.status===s)?.n,14);
  const roles=await q('SELECT role,count(*)::int AS n FROM project_memberships WHERE project_id=$1 GROUP BY role',[manifest.liveProjectId]);
  for(const [role,n] of Object.entries({SURVEY_MANAGER:1,SURVEY_SUPERINTENDENT:5,PARTY_CHIEF:42,INSTRUMENT_MAN:126,REQUESTER:459,PROJECT_ADMIN:1})) assert.equal(roles.find(r=>r.role===role)?.n,n);
  const rosters=await q('SELECT party_chief_id,count(*)::int AS n FROM crew_rosters WHERE tenant_id=$1 AND project_id=$2 GROUP BY party_chief_id',[manifest.tenantId,manifest.liveProjectId]);
  assert.equal(rosters.length,42); assert.ok(rosters.every(r=>r.n===3));
  assert.equal((await q('SELECT count(*)::int AS n FROM attachments WHERE tenant_id=$1',[manifest.tenantId]))[0].n,0);
  assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE tenant_id=$1 AND email NOT LIKE '%@sabine.example'",[manifest.tenantId]))[0].n,0);
  assert.equal((await q('SELECT count(*)::int AS n FROM tickets t WHERE t.tenant_id=$1 AND NOT EXISTS(SELECT 1 FROM ticket_events e WHERE e.ticket_id=t.id AND e.tenant_id=t.tenant_id)',[manifest.tenantId]))[0].n,0);
  assert.equal((await q("SELECT count(*)::int AS n FROM project_memberships WHERE project_id=$1 AND role<>'VIEWER'",[manifest.historyProjectId]))[0].n,0);
  const historicalEvents=await q('SELECT count(*)::int AS n FROM ticket_events e JOIN tickets t ON t.id=e.ticket_id AND t.tenant_id=e.tenant_id WHERE t.tenant_id=$1 AND t.project_id=$2',[manifest.tenantId,manifest.historyProjectId]);
  assert.equal(historicalEvents[0].n,20025);
  const base='http://127.0.0.1:3106';
  const checks=[];
  const liveTickets=await q('SELECT id FROM tickets WHERE tenant_id=$1 AND project_id=$2',[manifest.tenantId,manifest.liveProjectId]);
  for(const email of ['manager@sabine.example','super1@sabine.example','chief1@sabine.example','im1.1@sabine.example','requester0@sabine.example','admin@sabine.example']) {
    const login=await request(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:manifest.tenantId,email,password:config.SABINE_PASSWORD})});
    assert.equal(login.status,200,`Login failed: ${email}`);
    const user=(await login.json()).user;
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const projects=await request(`${base}/api/projects`,{headers:{cookie}});
    assert.equal(projects.status,200); assert.equal((await projects.json()).projects.length,2);
    const start=performance.now();
    const list=await request(`${base}/api/tickets?projectId=${manifest.liveProjectId}&limit=100`,{headers:{cookie}});
    assert.equal(list.status,200); const page=await list.json();
    let expectedRows;
    if(email.startsWith('manager')) expectedRows=liveTickets;
    else if(email.startsWith('admin')) expectedRows=[];
    else if(email.startsWith('requester')) expectedRows=await q('SELECT id FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND requester_id=$3',[manifest.tenantId,manifest.liveProjectId,user.id]);
    // This seed has flat AOR nodes; these expectations do not claim descendant-tree coverage.
    else if(email.startsWith('super')) expectedRows=await q('SELECT DISTINCT t.id FROM tickets t JOIN aor_assignments aa ON aa.aor_node_id=t.aor_node_id AND aa.tenant_id=t.tenant_id AND aa.project_id=t.project_id WHERE t.tenant_id=$1 AND t.project_id=$2 AND aa.user_id=$3 AND aa.deactivated_at IS NULL',[manifest.tenantId,manifest.liveProjectId,user.id]);
    else if(email.startsWith('chief')) expectedRows=await q('SELECT id FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND assigned_party_chief_id=$3',[manifest.tenantId,manifest.liveProjectId,user.id]);
    else expectedRows=await q('SELECT id FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND (assigned_instrument_man_id=$3 OR assigned_party_chief_id IN (SELECT party_chief_id FROM crew_rosters WHERE tenant_id=$1 AND project_id=$2 AND instrument_man_id=$3 AND deactivated_at IS NULL))',[manifest.tenantId,manifest.liveProjectId,user.id]);
    const expectedIds=expectedRows.map(r=>r.id).sort();
    assert.equal(page.total,expectedIds.length,`Scope count mismatch: ${email}`);
    assert.deepEqual(page.data.map(t=>t.id).sort(),expectedIds,`Scope identity mismatch: ${email}`);
    assert.ok(page.data.every(t=>t.tenantId===manifest.tenantId && t.projectId===manifest.liveProjectId));
    let allowedDetails=0, deniedDetails=0;
    for(const {id} of liveTickets) {
      const detail=await request(`${base}/api/tickets/${id}`,{headers:{cookie}});
      if(expectedIds.includes(id)) {
        assert.equal(detail.status,200,`Visible detail denied: ${email}, ${id}`);
        const body=await detail.json();
        assert.equal(body.ticket.id,id);
        assert.equal(body.ticket.tenantId,manifest.tenantId);
        assert.equal(body.ticket.projectId,manifest.liveProjectId);
        allowedDetails++;
      } else {
        assert.equal(detail.status,404,`Out-of-scope detail exposed: ${email}, ${id}`);
        const body=await detail.json();
        assert.equal(body.ticket,undefined);
        assert.equal(body.capabilities,undefined);
        deniedDetails++;
      }
    }
    const old=await request(`${base}/api/tickets?projectId=${manifest.historyProjectId}&limit=1`,{headers:{cookie}});
    assert.equal(old.status,200); const historicalPage=await old.json();
    assert.equal(historicalPage.total,20025);
    assert.equal(historicalPage.data.length,1);
    const historicalDetail=await request(`${base}/api/tickets/${historicalPage.data[0].id}`,{headers:{cookie}});
    assert.equal(historicalDetail.status,200);
    const historicalBody=await historicalDetail.json();
    assert.equal(historicalBody.ticket.projectId,manifest.historyProjectId);
    assert.deepEqual(historicalBody.capabilities,{
      canEditRequesterFields:false,canSubmit:false,canRequesterCancel:false,
      canCreateFollowUp:false,canUploadRequestInstruction:false,canUploadFieldSupport:false,
    });
    checks.push({role:email.split('@')[0],visibleLiveTickets:page.total,exactIds:true,allowedDetails,deniedDetails,historicalReadOnlyCapabilities:true,elapsedMs:Math.round(performance.now()-start)});
  }
  assert.equal((await request(`${base}/api/tickets?projectId=${manifest.liveProjectId}`)).status,401);
  fs.writeFileSync('.data/sabine/verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),counts,roles,checks,privacy:'allowlisted structured snapshot; no source prose or identities imported'},null,2),{mode:0o600});
  console.log(JSON.stringify({result:'passed',source:20199,historical:20025,live:84,roles,checks},null,2));
} finally { await pool.end(); }
