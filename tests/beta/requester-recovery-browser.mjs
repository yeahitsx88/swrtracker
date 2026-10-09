import {playwrightModuleURL} from '../playwright-runtime.mjs';
// Synthetic, intercepted UI acceptance; the review container has no database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
assert.equal(process.env.SWR_DRAFT_UI, '1');
const { chromium } = await import(playwrightModuleURL);
const browser = await chromium.launch({ headless:true, channel:'msedge' });
const base='http://127.0.0.1:3107';
const project='86000000-0000-4000-8000-000000000002', area='86000000-0000-4000-8000-000000000007';
const ticketId='86000000-0000-4000-8000-000000000010';
const captureDir='.impeccable/review'; assert.ok(fs.existsSync(captureDir));
try {
  for (const width of [1440,810,390]) {
    const context=await browser.newContext({ viewport:{ width,height:884 },locale:'en-US',timezoneId:'America/Chicago' });
    await context.addCookies([{ name:'swr_session',value:'synthetic-ui-only',url:base }]);
    let role='REQUESTER',created=0,uploads=0,firstSaveFailure=true,firstUploadFailure=true,patchFailure=false;
    let ticket={ id:ticketId,tenantId:project,projectId:project,requesterId:area,requesterName:'Synthetic requester',isOwnRequest:true,
      ticketNumber:null,status:'DRAFT',ticketType:null,aorNodeId:null,requestedDate:null,craft:'',fieldContact:null,
      fieldChannel:null,description:'',priority:'NORMAL',rowVersion:0,draftLastSavedAt:null,returnCycle:0,createdAt:'2026-09-30T12:00:00Z' };
    let files=[],deletedDrafts=[]; const ledger=new Map(),saveKeys=[],uploadKeys=[],patchKeys=[];
    const capabilities=()=>({ canEditRequesterFields:true,canSubmit:true,canRequesterCancel:false,canCreateFollowUp:false,
      canUploadRequestInstruction:true,canUploadFieldSupport:false });
    await context.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();
      const answer=(body,status=200)=>route.fulfill({ status,contentType:'application/json',body:JSON.stringify(body) });
      const error=(message,status=500,code)=>answer({ error:{ type:'InternalError',message,code } },status);
      const key=req.headers()['idempotency-key'];
      if(path==='/api/account')return answer({ name:'Synthetic requester',email:'requester@example.invalid' });
      if(path==='/api/projects')return answer({ projects:[{ id:project,name:'Sabine — synthetic UI acceptance',role,status:'ACTIVE' }] });
      if(path.endsWith('/aor'))return answer({ levels:[{id:area,depth:0,label:'Area'}],nodes:[{id:area,levelId:area,parentId:null,name:'Train 1',code:'T1'}] });
      if(path.endsWith('/request-config'))return answer({ config:{ leadTimeEnforcementEnabled:false,leadTimeDays:2,maxAttachmentsPerTicket:5 } });
      if(path.endsWith('/company-authority'))return answer({ companies:[],requesters:[],pendingInvites:[] });
      if(path.endsWith('/deleted-drafts'))return answer({ data:deletedDrafts,total:deletedDrafts.length,limit:20,offset:0 });
      if(path.endsWith('/restore')) { assert.ok(req.postDataJSON().reason.length>=10); deletedDrafts=[]; return answer({ restored:true }); }
      if(path.endsWith('/drafts')&&method==='POST') {
        saveKeys.push(key); if(!ledger.has(key)){ created++;ticket={...ticket,...req.postDataJSON(),draftLastSavedAt:'2026-09-30T12:30:00Z'};ledger.set(key,{ticket}); }
        if(firstSaveFailure){firstSaveFailure=false;return error('Connection interrupted. Retry the same draft save.');}
        return answer(ledger.get(key),201);
      }
      if(path===`/api/tickets/${ticketId}`&&method==='PATCH') {
        patchKeys.push(key); if(!ledger.has(key)){ticket={...ticket,...req.postDataJSON(),rowVersion:ticket.rowVersion+1};ledger.set(key,{ticket});}
        if(patchFailure){patchFailure=false;return error('Save response interrupted.');}
        return answer(ledger.get(key));
      }
      if(path===`/api/tickets/${ticketId}`)return answer({ticket,capabilities:capabilities()});
      if(path.endsWith('/submit')) { ticket={...ticket,status:'SUBMITTED',ticketNumber:'FSS-T1-00001'};return answer({ticket}); }
      if(path.endsWith('/history'))return answer({ history:[{ id:'history',source:'NEED_BY_REVISION',type:'Need-By revised',occurredAt:'2026-09-30T12:30:00Z',actor:{name:'Synthetic manager'},details:{oldDate:'2028-02-28',newDate:'2028-02-29',reason:'Meeting adjustment'} }] });
      if(path.endsWith('/attachments')) {
        if(method==='GET')return answer({attachments:files});
        uploadKeys.push(key); if(!ledger.has(key)){uploads++;const attachment={ id:'file',ticketId,tenantId:project,uploadedBy:area,contentSha256:'0'.repeat(64),filename:'instructions.txt',mimeType:'text/plain',sizeBytes:14,purpose:'REQUEST_INSTRUCTION',returnCycle:0,createdAt:'2026-09-30T12:30:00Z',downloadUrl:'/synthetic-file' };files=[attachment];ledger.set(key,{attachment});}
        if(firstUploadFailure){firstUploadFailure=false;return error('Upload response interrupted.');}
        return answer(ledger.get(key),201);
      }
      if(path==='/api/tickets')return answer({ data:[ticket],total:1,offset:0,limit:20 });
      throw new Error(`Unmocked synthetic UI request: ${method} ${path}`);
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',err=>errors.push(err.message));
    page.setDefaultTimeout(8000);
    page.on('dialog',dialog=>dialog.dismiss());
    const snap=async(name)=>{await page.evaluate(()=>window.scrollTo(0,0));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} overflow`);await page.screenshot({path:`${captureDir}/draft-${name}-${width}.png`,fullPage:true,animations:'disabled'});};
    await page.goto(`${base}/projects/${project}/request/new`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Save Draft',exact:true}).click();
    await page.getByRole('button',{name:'Retry Save Draft',exact:true}).waitFor();
    assert.equal(await page.getByLabel(/^Area/).isDisabled(),true);
    await page.getByRole('button',{name:'Retry Save Draft',exact:true}).click();
    await page.getByText('Draft and selected files saved. You can leave and resume from Drafts.').waitFor();
    assert.equal(created,1);assert.equal(saveKeys[0],saveKeys[1]);
    await snap('wizard');
    await page.getByLabel(/^Area/).selectOption(area);
    await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByLabel('Request Type').selectOption('TOPO');
    await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByLabel('Need-By Date',{exact:true}).fill('2028-02-29');
    await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByLabel('Point of Contact').fill('Synthetic foreman');await page.getByLabel('Request Details').fill('Check control at Train 1 — synthetic acceptance, not site data.');
    // Deliberate app-link navigation warns and cancellation preserves progress.
    await page.getByRole('link',{name:'Open saved details and files'}).click();assert.match(page.url(),/request\/new/);
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await page.locator('input[type=file]').setInputFiles({name:'instructions.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic file')});
    await page.getByRole('button',{name:'Add File',exact:true}).click();
    await page.getByRole('button',{name:'Save Draft',exact:true}).click();await page.getByText('Upload response interrupted.').waitFor();
    assert.equal(await page.getByRole('button',{name:'Remove instructions.txt'}).count(),1);
    await page.getByRole('button',{name:'Save Draft',exact:true}).click();await page.getByText('Draft and selected files saved. You can leave and resume from Drafts.').waitFor();
    assert.equal(uploads,1);assert.equal(uploadKeys[0],uploadKeys[1]);
    await page.getByRole('button',{name:'Next',exact:true}).click();await page.locator('.detail-grid > div').filter({has:page.getByText('Need-By',{exact:true})}).getByText('Feb 29, 2028',{exact:true}).waitFor();
    await snap('review');
    // Reload resumes the durable record, with no second creation.
    await page.reload({waitUntil:'networkidle'});await page.getByText('Saved draft loaded. Previously uploaded files are available in draft details.').waitFor();assert.equal(created,1);
    ticket={...ticket,status:'RETURNED_FOR_CORRECTION',ticketNumber:'FSS-T1-00001'};
    await page.goto(`${base}/projects/${project}/tickets/${ticketId}`,{waitUntil:'networkidle'});
    assert.match(page.url(),/\/tickets\//,'Saved wizard must not trigger an unsaved-navigation warning');
    await page.getByRole('heading',{name:'Requester Changes'}).waitFor().catch(async error=>{
      console.error(JSON.stringify({ url:page.url(),text:await page.locator('body').innerText(),errors })); throw error;
    });
    await page.getByLabel(/^Request Details/).fill('Corrected Train 1 control — synthetic acceptance only.');
    assert.equal(await page.getByRole('button',{name:'Resubmit for Approval'}).isDisabled(),true);
    await snap('correction');
    patchFailure=true;await page.getByRole('button',{name:'Save Changes',exact:true}).click();
    await page.getByRole('button',{name:'Retry Save',exact:true}).waitFor();assert.equal(await page.getByLabel(/^Request Details/).isDisabled(),true);
    await page.getByRole('button',{name:'Retry Save',exact:true}).click();
    await page.getByRole('button',{name:'Save Changes',exact:true}).waitFor();assert.equal(patchKeys.at(-1),patchKeys.at(-2));
    assert.equal(await page.getByRole('button',{name:'Resubmit for Approval'}).isEnabled(),true);
    // Failed detail upload must retain the file selection.
    firstUploadFailure=true;await page.locator('input[type=file]').setInputFiles({name:'instructions.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic file')});
    await page.getByRole('button',{name:'Upload File',exact:true}).click();await page.getByRole('button',{name:'Retry Upload'}).waitFor();
    assert.equal(await page.locator('input[type=file]').evaluate(node=>node.files.length),1);
    await page.getByRole('button',{name:'Retry Upload'}).click();await page.getByText('Attachment uploaded.',{exact:true}).waitFor();
    assert.equal(uploadKeys.at(-1),uploadKeys.at(-2));
    ticket={...ticket,status:'DRAFT',ticketNumber:null,ticketType:null,requestedDate:null,description:'Partial progress — synthetic only'};
    await page.goto(`${base}/projects/${project}/drafts`,{waitUntil:'networkidle'});await page.getByRole('link',{name:'Resume draft'}).waitFor();await snap('list');
    role='PROJECT_ADMIN';deletedDrafts=[{id:ticketId,description:'Partial progress — synthetic only',requesterName:'Synthetic requester',deletedAt:'2026-09-30T12:30:00Z',rowVersion:4,recoverable:true}];
    await page.goto(`${base}/projects/${project}/admin`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'View deleted drafts'}).click();await page.getByRole('button',{name:'Review recovery'}).click();
    await page.getByLabel('Recovery reason (at least 10 characters)').fill('short');assert.equal(await page.getByRole('button',{name:'Confirm Restore Draft'}).isDisabled(),true);
    await page.getByLabel('Recovery reason (at least 10 characters)').fill('Restore mistaken deletion — synthetic test.');await snap('recovery');
    await page.getByRole('button',{name:'Confirm Restore Draft'}).click();await page.getByText('Draft restored to its requester with the same ID, files and history. No operational role or request approval was granted.').waitFor();
    assert.deepEqual(errors,[]);console.log(JSON.stringify({width,partialSave:true,sameRecordResume:true,stableSaveRetry:true,stableUploadRetry:true,dirtyResubmitGuard:true,failedFileRetained:true,recoveryConfirmation:true,pageErrors:0,realDataWrites:0}));
    await context.close();
  }
} finally { await browser.close(); }
