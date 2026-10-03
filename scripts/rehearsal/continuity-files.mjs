import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const s=JSON.parse(await fs.readFile('.local-customer-rehearsal/operations.json','utf8')),f=JSON.parse(await fs.readFile('.local-customer-rehearsal/manifest.json','utf8')).datasets.human;
assert.equal(f.port,3116);const origin='http://localhost:3116',cookies=new Map(),checks=[];
async function cookie(actor){if(!cookies.has(actor.id)){const r=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:f.tenant,email:actor.email,password:f.password})});assert.equal(r.status,200);cookies.set(actor.id,r.headers.get('set-cookie').split(';')[0]);}return cookies.get(actor.id);}
for(const t of s.requests.filter(t=>t.attachment).filter((_,i)=>i%4===0)){
 const requester=s.people.find(p=>p.id===t.requesterId),other=s.people.find(p=>p.role==='REQUESTER'&&p.id!==requester.id&&p.companyId!==requester.companyId);
 const response=await fetch(origin+t.attachment.downloadUrl,{headers:{cookie:await cookie(requester)}}),match=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')===t.attachmentHash;
 assert.equal(response.status,200);assert.ok(match);checks.push({ticketId:t.id,status:response.status,match});
 const denied=await fetch(origin+t.attachment.downloadUrl,{headers:{cookie:await cookie(other)}});assert.ok([403,404].includes(denied.status));checks.push({ticketId:t.id,foreignRequesterDenied:true,status:denied.status});
}
await fs.writeFile('audits/customer-lifecycle-rehearsal/continuity/files.json',JSON.stringify({at:new Date().toISOString(),checks,measurement:'Every fourth retained attachment, actual requester download SHA-256 and unrelated-company requester denial after isolated runtime replacement.'},null,2));
console.log(JSON.stringify({checks:checks.length,pass:true}));
