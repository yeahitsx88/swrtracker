import {playwrightModuleURL} from '../playwright-runtime.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
assert.equal(process.env.SWR_INTAKE_CYCLE,'251');
const dir='.local/alpha-closure251',f=JSON.parse(await fs.readFile(dir+'/fixture.json','utf8'));
assert.match(f.schema,/^alpha_intake251_[a-f0-9]{32}$/);assert.equal(f.origin,'http://127.0.0.1:3299');
assert.equal(await fs.access(dir+'/before.json').then(()=>true,()=>false),false);
const {chromium}=await import(playwrightModuleURL);
const b=await chromium.launch({channel:'msedge',headless:true});
try {
const c=await b.newContext();await c.addCookies([{name:'swr_session',value:f.tokens.requester,url:f.origin}]);const p=await c.newPage();
await p.goto(f.origin+'/projects/'+f.project+'/request/new');await p.getByRole('combobox',{name:'Area',exact:true}).waitFor();
for(let i=0;i<4;i++)await p.getByRole('button',{name:'Next',exact:true}).click();
await p.getByLabel('File',{exact:true}).setInputFiles({name:'intake251-before.txt',mimeType:'text/plain',buffer:Buffer.from('Owned original upload251')});await p.getByRole('button',{name:'Add File',exact:true}).click();
let committed;await p.route('**/attachments',async r=>{if(r.request().method()!=='POST')return r.continue();const reply=await r.fetch();assert.equal(reply.status(),201);committed={reply:await reply.json(),key:r.request().headers()['idempotency-key']};await r.abort('failed');});
await p.getByRole('button',{name:'Save Draft',exact:true}).click();await p.getByRole('button',{name:'Save Draft',exact:true}).waitFor();await p.getByText(/Unable to confirm|Failed to fetch|fetch failed|Network/).first().waitFor();
assert(committed);assert.equal(await p.locator('fieldset').getAttribute('disabled'),null);assert.equal(await p.getByRole('button',{name:'Remove intake251-before.txt',exact:true}).isEnabled(),true);
const id=new URL(p.url()).searchParams.get('draft');assert(id);const response=await c.request.get(f.origin+'/api/tickets/'+id+'/attachments');assert.equal(response.status(),200);const files=await response.json();assert.equal(files.attachments.length,1);
await fs.writeFile(dir+'/before.json',JSON.stringify({source:'b612858',defect:'ALPHA-INTAKE-UPLOAD-251',id,committed,files,fieldsetUnlocked:true,stagedRemovalEnabled:true},null,2));await p.screenshot({path:dir+'/before.png'});console.log('Confirmed: committed upload with lost response unlocks fields and staged-file removal. Original request and file retained.');
}finally{await b.close();}
