import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {NextRequest} from 'next/server';
import {errorResponse} from '@/lib/api-error';
import {ValidationError} from '@/shared/errors';
import {WebhookEmailTransport} from '@/lib/email';
import {LocalAttachmentStorage} from '@/modules/attachment/infrastructure';
import {readJsonBody} from '@/lib/read-json-body';

test('unexpected API errors correlate diagnostics without logging messages, SQL, stack or secrets',async()=>{
 const logs:string[]=[];const original=console.error;console.error=(line?:unknown)=>{logs.push(String(line));};
 try{
  const error=Object.assign(new Error('password=private reset-token SELECT sensitive'),{code:'42P01',detail:'private',query:'SELECT private'});
  const response=errorResponse(error),body=await response.json();assert.equal(response.status,500);
  assert.equal(body.error.message,'An unexpected error occurred');assert.equal(logs.length,1);
  const logged=JSON.parse(logs[0]!);assert.equal(logged.correlation_id,body.error.correlationId);assert.equal(logged.database_code,'42P01');
  assert.ok(!JSON.stringify(body).includes('private'));assert.ok(!logs[0]!.includes('private'));assert.ok(!logs[0]!.includes('SELECT'));
  errorResponse(new ValidationError('Use a valid field'));assert.equal(logs.length,1);
 }finally{console.error=original;}
});

test('JSON body parser returns validation failure for malformed JSON but preserves internal errors',async()=>{
 const req=new NextRequest('http://localhost/api/test',{method:'POST',body:'{'});
 await assert.rejects(()=>readJsonBody(req),ValidationError);
 const internal=new TypeError('already consumed');await assert.rejects(()=>readJsonBody({json:async()=>{throw internal;}}),e=>e===internal);
});

test('webhook send aborts a stalled loopback provider',async()=>{
 const server=createServer(()=>{});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();assert.ok(address&&typeof address==='object');
  const transport=new WebhookEmailTransport(`http://127.0.0.1:${address.port}`,undefined,150);
  await assert.rejects(()=>transport.send({to:['synthetic@example.invalid'],subject:'Synthetic',text:'No external delivery'}),e=>e instanceof Error&&e.name==='TimeoutError');
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('attachment removal tolerates only absent objects and surfaces actual filesystem errors',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'swr-alpha1-storage-'));
 const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 try{
  const storage=new LocalAttachmentStorage(root);await storage.remove(key);
  await mkdir(path.join(root,...key.split('/')),{recursive:true});
  await assert.rejects(()=>storage.remove(key),e=>e instanceof Error&&'code' in e&&['EISDIR','EPERM','EACCES'].includes(String(e.code)));
 }finally{await rm(root,{recursive:true,force:true});}
});
