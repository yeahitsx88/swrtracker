// Read-only witness for the existing Northbank rehearsal, not production data.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
const f=JSON.parse(await fs.readFile('.local-customer-rehearsal/manifest.json','utf8')).datasets.human;
assert.match(f.schema,/^customer_rehearsal_[a-f0-9]{32}$/);assert.equal(f.port,3116);
const s=JSON.parse(await fs.readFile('.local-customer-rehearsal/operations.json','utf8'));
const cfg=JSON.parse(execFileSync('docker',['inspect','swr-area-unlink-ui-f590f61c'],{encoding:'utf8'}))[0];assert.equal(cfg.NetworkSettings.Ports['5432/tcp'][0].HostPort,'15489');
const env=Object.fromEntries(cfg.Config.Env.map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
const pool=new Pool({host:'127.0.0.1',port:15489,database:'swr_team_isolated',user:env.POSTGRES_USER||'postgres',password:env.POSTGRES_PASSWORD}),db=await pool.connect();
try{
 await db.query(`SET search_path TO "${f.schema}",public`);const hashes={};
 for(const table of ['tickets','ticket_events','attachments','ticket_assignment_history','users','project_memberships','survey_teams','survey_team_members','crew_rosters','survey_reporting_links','aor_assignments'])hashes[table]=createHash('sha256').update(JSON.stringify((await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows)).digest('hex');
 const project=(await db.query('SELECT p.name,p.status,p.archived_at,u.name AS archived_by FROM projects p LEFT JOIN users u ON u.id=p.archived_by AND u.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND p.id=$2',[f.tenant,s.project.id])).rows[0];
 const counts=(await db.query('SELECT status,count(*)::int AS n FROM tickets WHERE tenant_id=$1 AND project_id=$2 GROUP BY status ORDER BY status',[f.tenant,s.project.id])).rows;
 const evidence={at:new Date().toISOString(),project,counts,hashes};
 await fs.mkdir('audits/customer-lifecycle-rehearsal/continuity',{recursive:true});
 const mode=process.argv[2];assert.ok(['before','after'].includes(mode));
 if(mode==='after'){
  const before=JSON.parse(await fs.readFile('audits/customer-lifecycle-rehearsal/continuity/retained-before.json','utf8'));
  const originalEvents=(await db.query('SELECT to_jsonb(t) AS row FROM ticket_events t WHERE created_at<=$1 ORDER BY to_jsonb(t)::text',[before.at])).rows;
  evidence.originalEventsHash=createHash('sha256').update(JSON.stringify(originalEvents)).digest('hex');assert.equal(evidence.originalEventsHash,before.hashes.ticket_events);
  for(const [table,hash] of Object.entries(hashes))if(table!=='ticket_events')assert.equal(hash,before.hashes[table],table);
  evidence.appendedAuditEvents=(await db.query('SELECT event_type,count(*)::int AS count FROM ticket_events WHERE created_at>$1 GROUP BY event_type ORDER BY event_type',[before.at])).rows;
  assert.ok(evidence.appendedAuditEvents.every(e=>e.event_type==='attachment.downloaded'));
  assert.deepEqual(counts,before.counts);assert.deepEqual(JSON.parse(JSON.stringify(project)),before.project);
  evidence.preservation='Ten full table hashes, all original ticket-event rows, archive state and request totals unchanged; authorized verification downloads append normal audit events';
 }
 await fs.writeFile(`audits/customer-lifecycle-rehearsal/continuity/retained-${mode}.json`,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({project,counts,preservation:evidence.preservation??'Before witness retained'}));
}finally{db.release();await pool.end();}
