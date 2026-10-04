// Explicitly owned synthetic fixture only; account credentials never enter receipts.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
const f=JSON.parse(await fs.readFile(process.env.SWR_ADMIN_FIXTURE_FILE??'.local-restoration-fixture.json','utf8'));
assert.equal(process.env.SWR_ADMIN_RESTORATION,'1');assert.match(f.schema,/^phase5_acceptance_[a-f0-9]{32}$/);
const retained=JSON.parse(await fs.readFile('.local-demo-fixture.json','utf8'));assert.notEqual(f.schema,retained.schema);
const origin=process.env.SWR_ACCEPTANCE_ORIGIN;assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
let checks=0;const receipt=[];
const cookie=role=>'swr_session='+jwt.sign({sub:f[role],tenantId:role==='foreignAdmin'?f.foreignTenant:f.tenant,sv:1},process.env.JWT_SECRET,{expiresIn:'1h'});
async function request(role,path,body,key=randomUUID()){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{cookie:cookie(role),'content-type':'application/json','Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
function check(condition,label){assert(condition,label);checks++;receipt.push(label);}
const path=`/api/projects/${f.project}/employees`,body=()=>({companyId:f.company,name:'HTTP Employee',email:randomUUID()+'@example.test',password:'Synthetic-Only-2026!',role:'REQUESTER',projectAdmin:false,confirmed:true});
const first=body(),key=randomUUID();const pair=await Promise.all([request('itOnly',path,first,key),request('itOnly',path,first,key)]);
check(pair.every(r=>r.status===201),'Concurrent same-key creation succeeds');check(pair[0].body.employee.id===pair[1].body.employee.id,'Concurrent replay returns one account');check(!JSON.stringify(pair).includes(first.password),'Password excluded from response');
check((await request('itOnly',path,{...first,name:'Changed'},key)).status===409,'Changed body needs deliberate reload');
check((await request('itOnly',path,first)).status===409,'Duplicate email cannot create another account');
check((await request('localAdmin',path,body())).status===201,'Scoped Project Admin creates employee');
const elevated=await request('itOnly',path,{...body(),projectAdmin:true});check(elevated.status===201&&elevated.body.employee.projectAdmin===true,'Central IT creates independent Project Admin');
check(elevated.body.employee.role==='REQUESTER','Admin creation preserves explicit operational role');
for(const role of ['manager','subject','foreignAdmin'])check([403,404].includes((await request(role,path,body())).status),`${role} cannot provision this project`);
for(const role of ['TENANT_ADMIN','PROJECT_ADMIN','INVENTED'])check((await request('itOnly',path,{...body(),role})).status===400,`Fixed-role validation rejects ${role}`);
check((await request('itOnly',path,{...body(),companyId:f.foreignCompany})).status===404,'Foreign company denied');
check((await request('itOnly',path,{...body(),password:'short'})).status===400,'Invalid initial password denied');
check((await request('itOnly',path,{...body(),confirmed:false})).status===400,'Explicit confirmation required');
check((await request('itOnly',`/api/projects/${f.archivedProject}/employees`,body())).status===409,'Archived project cannot receive new employees');
const company=await request('localAdmin',`/api/projects/${f.project}/companies`,{name:'HTTP Subcontractor',type:'SUBCONTRACTOR',confirmed:true});check(company.status===200,'Scoped company registration works');
const sub={...body(),companyId:company.body.company.id};check((await request('localAdmin',path,{...sub,role:'VIEWER'})).status===400,'Subcontractor fixed Requester restriction');check((await request('localAdmin',path,{...sub,projectAdmin:true})).status===400,'Subcontractor cannot become Project Admin');check((await request('localAdmin',path,sub)).status===201,'Subcontractor Requester creation works');
const template={name:'HTTP Template '+randomUUID(),crewBuild:'FULL',aorDepth:1,aorLevelLabels:['Area'],disciplineGroups:['Survey']},templateKey=randomUUID();
const created=await request('itOnly','/api/project-templates',template,templateKey),replay=await request('itOnly','/api/project-templates',template,templateKey);
check(created.status===201&&replay.status===201&&created.body.template.id===replay.body.template.id,'Template exact retry creates one template');
check((await request('itOnly','/api/project-templates',{...template,name:'Changed'},templateKey)).status===409,'Template payload mismatch requires reload');
check((await request('localAdmin','/api/project-templates',template)).status===403,'Shared template authority remains Central IT only');
console.log('Administration workflow HTTP checks passed: '+checks);
await fs.writeFile('.local-admin-workflows-http-results.json',JSON.stringify({checks,receipt},null,2));
