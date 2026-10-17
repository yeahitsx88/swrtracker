// Read-only deployed access matrix, independent of the original seed's status counts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pool } from 'pg';
if(process.env.SWR_REQUEST_ACCESS_HTTP!=='1')throw Error('SWR_REQUEST_ACCESS_HTTP=1 required');
const config=JSON.parse(fs.readFileSync('.data/sabine/runtime.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('.data/sabine/manifest.json','utf8'));
const url=new URL(config.DATABASE_URL);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15488');assert.equal(url.pathname,'/swr_sabine_simulation');
const db=new Pool({connectionString:url.href,max:1});const base='http://127.0.0.1:3106';
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const fingerprint=async()=> (await query(`SELECT count(*)::text AS n,md5(string_agg(id::text||':'||status::text||':'||row_version::text,',' ORDER BY id)) AS hash FROM tickets`))[0];
const before=await fingerprint();let checks=0;
try{
  const tickets=await query('SELECT id FROM tickets WHERE tenant_id=$1 AND project_id=$2',[manifest.tenantId,manifest.liveProjectId]);
  for(const account of ['manager','super1','chief1','im1.1','requester0','admin']){
    const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:manifest.tenantId,email:`${account}@sabine.example`,password:config.SABINE_PASSWORD})});
    assert.equal(login.status,200);checks++;const user=(await login.json()).user;
    const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    const get=path=>fetch(base+path,{headers:{cookie},signal:AbortSignal.timeout(10000)});
    try{
      let rows;
      const args=[manifest.tenantId,manifest.liveProjectId,user.id];
      if(account==='manager')rows=tickets;
      else if(account==='admin')rows=[];
      else if(account==='requester0')rows=await query('SELECT id FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND requester_id=$3',args);
      else if(account==='chief1')rows=await query('SELECT id FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND assigned_party_chief_id=$3',args);
      else if(account==='super1')rows=await query('SELECT DISTINCT t.id FROM tickets t JOIN aor_assignments aa ON aa.aor_node_id=t.aor_node_id AND aa.tenant_id=t.tenant_id AND aa.project_id=t.project_id WHERE t.tenant_id=$1 AND t.project_id=$2 AND aa.user_id=$3 AND aa.deactivated_at IS NULL',args);
      else rows=await query('SELECT id FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND (assigned_instrument_man_id=$3 OR assigned_party_chief_id IN (SELECT party_chief_id FROM crew_rosters WHERE tenant_id=$1 AND project_id=$2 AND instrument_man_id=$3 AND deactivated_at IS NULL))',args);
      const allowed=new Set(rows.map(row=>row.id));
      const list=await get(`/api/tickets?projectId=${manifest.liveProjectId}&limit=200`);assert.equal(list.status,200);
      const page=await list.json();assert.equal(page.total,allowed.size);assert.deepEqual(page.data.map(ticket=>ticket.id).sort(),[...allowed].sort());checks++;
      for(const ticket of tickets)for(const suffix of ['', '/history','/attachments']){
        const response=await get(`/api/tickets/${ticket.id}${suffix}`);assert.equal(response.status,allowed.has(ticket.id)?200:404);
        if(!allowed.has(ticket.id))assert.equal((await response.json()).error.code,'NOT_FOUND');checks++;
      }
      for(const path of ['/api/tickets/not-a-uuid',`/api/tickets?projectId=${manifest.liveProjectId}&projectId=${manifest.historyProjectId}`, '/api/tickets?projectId=bad']){assert.equal((await get(path)).status,400);checks++;}
      const old=await get(`/api/tickets?projectId=${manifest.historyProjectId}&limit=1`);assert.equal(old.status,200);
      const historical=await old.json();assert.equal(historical.total,20025);
      const oldDetail=await get(`/api/tickets/${historical.data[0].id}`);assert.equal(oldDetail.status,200);
      assert.ok(Object.values((await oldDetail.json()).capabilities).every(value=>value===false));checks++;
      if(account==='admin'){
        const response=await get(`/api/projects/${manifest.liveProjectId}/notifications`);assert.equal(response.status,200);
        for(const message of (await response.json()).messages){assert.equal(message.ticketId,null);assert.equal(message.ticketNumber,null);assert.match(message.body,/Delivery health only/);}checks++;
      }
    }finally{
      const logout=await fetch(`${base}/api/auth/logout`,{method:'POST',headers:{cookie}});assert.equal(logout.status,200);
      assert.equal((await get('/api/tickets/'+tickets[0].id)).status,401);checks++;
    }
  }
  assert.deepEqual(await fingerprint(),before);
  console.log(`Deployed request access: ${checks} checks passed; six accounts, ${tickets.length} current live requests, details/history/metadata, historical read-only, redacted IT and revoked test sessions; request fingerprint unchanged.`);
}finally{await db.end();}
