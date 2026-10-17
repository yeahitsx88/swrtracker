// Local captured-outbox acceptance only; never dispatches mail or prints secrets.
import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash,createDecipheriv,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
assert.equal(process.env.SWR_RECONCILIATION,'1');
const f=JSON.parse(await readFile('.local-reconciliation-fixture.json','utf8'));
assert.match(f.schema,/^reconcile_http_[a-f0-9]{32}$/);assert.equal(f.origin,'http://127.0.0.1:3320');
const url=new URL(process.env.DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');url.searchParams.set('options','-c search_path='+f.schema+',public');
const db=new Pool({connectionString:url.href}),path='.local-reconciliation-identity.json';
try{
 assert.equal((await db.query('SELECT current_schema() s')).rows[0].s,f.schema);
 if(process.env.SWR_IDENTITY_PHASE==='verify'){
  const h=JSON.parse(await readFile(path,'utf8'));assert.equal(h.schema,f.schema);assert(h.completed);
  const count=(await db.query('SELECT count(*)::int n FROM revoked_auth_sessions WHERE tenant_id=$1 AND user_id=$2 AND token_hash=$3',[f.tenant,f.people.tenantOnly,createHash('sha256').update(h.loggedOutToken).digest('hex')])).rows[0].n;
  assert.equal(count,1);console.log('Owned identity: one durable logged-out bearer; no mail dispatch.');
 }else{
  assert.equal(await access(path).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}),false,'Never overwrite an identity acceptance handoff');
  const email=f.people.viewer+'@reconciliation.invalid';
  const response=await fetch(f.origin+'/api/auth/forgot-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:f.tenant,email}),signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{success:true});
  const rows=(await db.query('SELECT encrypted_payload FROM password_reset_email_outbox WHERE tenant_id=$1 AND encrypted_payload IS NOT NULL ORDER BY expires_at DESC',[f.tenant])).rows;
  const key=createHash('sha256').update('swr-password-reset-outbox-v1\0').update(process.env.JWT_SECRET??'').digest();
  const messages=rows.map(row=>{const [iv,tag,ciphertext]=row.encrypted_payload.split('.').map(p=>Buffer.from(p,'base64url'));const d=createDecipheriv('aes-256-gcm',key,iv);d.setAuthTag(tag);return JSON.parse(Buffer.concat([d.update(ciphertext),d.final()]).toString('utf8'));});
  const message=messages.find(m=>m.recipientEmail===email);assert(message);assert.equal(message.tenantId,f.tenant);
  await writeFile(path,JSON.stringify({schema:f.schema,email,token:message.resetToken,newPassword:'Synthetic-reset-'+randomUUID()+'!',completed:false})+'\n');
  console.log('Owned identity: reset requested and encrypted local outbox captured; private handoff saved.');
 }
}finally{await db.end();}
