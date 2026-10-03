'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {FrozenCommand,CommandOwner} from '@/lib/frozen-command';
import {Button,Card,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
import {AccountOffboarding} from './account-offboarding';
import {SurveyManagerHandover} from './survey-manager-handover';
import {AdministrationSection,AdministrationRecords} from './administration-records';
import {AdministrationBatch,type AdministrationAction} from './administration-batch';
import {ProjectAdminOnboarding} from './project-admin-onboarding';
import {CompanyRegistration} from './company-registration';
import {AdministrationDialog} from './administration-dialog';
import type {UUID} from '@/shared/types';
interface Member {userId:string;name:string;email:string;role:string;accessDisabledAt:string|null;accountDisabledAt:string|null;canAdminister?:boolean}
interface Companies {companies:Array<{id:string;name:string;type:string}>;candidates:Array<{userId:string;name:string;email:string;companyName:string}>}
type Intent={url:string;method:'POST'|'PATCH'|'DELETE';body:Record<string,unknown>;label:string};
export function ProjectAdministration({projectId}:{projectId:string}){
 const owner=useRef(new CommandOwner()).current;const token='project-administration';const ownerToken=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const base=`/api/projects/${projectId}`;
 const [members,setMembers]=useState<Member[]>([]),[admins,setAdmins]=useState<Member[]>([]),[companies,setCompanies]=useState<Companies>();
 const [selected,setSelected]=useState<Member>(),[promotion,setPromotion]=useState<Member>();
 const [role,setRole]=useState('REQUESTER'),[email,setEmail]=useState('');
 const [intentResult,setIntentResult]=useState<string>(),[diagnosticsOpen,setDiagnosticsOpen]=useState(false);
 const [memberOpen,setMemberOpen]=useState(false);
 const [templateId,setTemplateId]=useState(''),[template,setTemplate]=useState<{templates:Array<{id:string;name:string}>;project:{status:string;templateId:string|null;hasBeenActivated?:boolean}}>();
 const [diagnostics,setDiagnostics]=useState<Record<string,string|number>>(),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>(),[intent,setIntent]=useState<Intent>(),[consent,setConsent]=useState(false),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false);
 const childLock=useRef(false);
 const gate=useRef(new FrozenCommand<Intent>()),generation=useRef(0);
 const [memberSelection,setMemberSelection]=useState<string[]>([]),[adminSelection,setAdminSelection]=useState<string[]>([]),[candidateSelection,setCandidateSelection]=useState<string[]>([]),[removalQueue,setRemovalQueue]=useState<Member[]>([]),[batch,setBatch]=useState<AdministrationAction[]>();
 async function readAll<T>(path:string,field:string):Promise<T[]>{const all:T[]=[];for(let page=0;page<1000;page++){const result=await apiRequest<Record<string,T[]>>(`${path}?includeDisabled=true&limit=100&offset=${page*100}`);const rows=result[field];if(!Array.isArray(rows))throw new Error("Invalid administrative page");all.push(...rows);if(rows.length<100)return all;}throw new Error('Too many records; narrow the administrative population.');}
 async function load(){const epoch=++generation.current;setLoading(true);setError(undefined);
  try{const results=await Promise.all([readAll<Member>(`${base}/members`,'members'),readAll<Member>(`${base}/administrators`,'administrators'),apiRequest<Companies>(`${base}/companies`),apiRequest<NonNullable<typeof template>>(`${base}/template`),readAll<Companies['candidates'][number]>(`${base}/companies`,'candidates')]);
   if(epoch!==generation.current)return;setMembers(results[0]);setAdmins(results[1]);setCompanies({...results[2],candidates:results[4]});setTemplate(results[3]);setTemplateId(results[3].project.templateId??'');
  }catch(cause){if(epoch===generation.current)setError(getErrorMessage(cause,'Unable to load project administration.'));}
  finally{if(epoch===generation.current)setLoading(false);}
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[projectId]);
 const closed=template?.project.status==='ARCHIVED';
 const locked=gate.current.locked||ownerToken!==null;
 function propose(value:Intent){if(locked||childLock.current||closed||batch)return;setIntent(value);setIntentResult(undefined);setConsent(false);setSuccess(undefined);setError(undefined);}
 function closeIntent(){if(!owner.blocked(token)&&gate.current.reload()){owner.release(token);setIntent(undefined);setIntentResult(undefined);setConsent(false);setError(undefined);void load();}}
 async function submit(){if(!intent||!owner.claim(token))return;const frozen=gate.current.begin(intent,crypto.randomUUID());if(!frozen){if(!gate.current.locked)owner.release(token);return;}setRevision(n=>n+1);setError(undefined);
  try{await apiRequest(frozen.body.url,{method:frozen.body.method,body:frozen.body.body,headers:{'Idempotency-Key':frozen.key}});gate.current.success();setSuccess(`${frozen.body.label} completed. Affected authority changes require sign-in renewal.`);setIntentResult(`${frozen.body.label} completed.`);setConsent(false);void load();}
  catch(cause){gate.current.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The outcome is uncertain. Retry the same action.'));}
  finally{if(!gate.current.locked)owner.release(token);setRevision(n=>n+1);}
 }
 void revision;
 return <div className="stack">
 <ProjectAdminOnboarding projectId={projectId} owner={owner} disabled={!template||closed||!!intent||!!batch||!!selected||!!promotion} onDone={()=>void load()}/>
 <Card title="Project personnel administration" description="Membership, operational roles and independent Project Admin authority are separate."><div className="stack">
 {error&&<ErrorBanner message={error}/>} {success&&<SuccessBanner message={success}/>} {loading&&<p role="status">Loading project administration…</p>}
 {closed&&<p>This archived project retains history. Access removal remains available; other administration is read-only.</p>}
 <Button disabled={locked||closed||!!intent||!!batch||!!selected||!!promotion} onClick={()=>setMemberOpen(true)}>Add project members</Button>
 {memberOpen&&<AdministrationDialog title="Add project members" description="Select eligible accounts, choose their operational role, then review the additions." closeDisabled={childLock.current||locked||!!batch} onClose={()=>{if(!locked&&!batch&&!childLock.current){setMemberOpen(false);setCandidateSelection([]);}}}>
 <p>Associate the person's company with this project first. Select eligible accounts, then review their project role.</p>
 <AdministrationRecords label="eligible accounts" rows={companies?.candidates??[]} id={c=>c.userId} columns={[{key:'name',label:'Name',text:c=>c.name},{key:'email',label:'Email',text:c=>c.email},{key:'company',label:'Company',text:c=>c.companyName}]} selected={candidateSelection} onSelection={setCandidateSelection} disabled={locked} eligible={()=>true}/>
 <label className="field"><span className="field-label">Operational role</span><select className="select" value={role} disabled={locked||closed} onChange={e=>setRole(e.target.value)}>{['REQUESTER','SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','CAD_TECHNICIAN','CAD_LEAD','VIEWER'].map(r=><option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></label>
 <Button disabled={!candidateSelection.length||locked||closed||!!batch||!!intent} onClick={()=>setBatch(companies?.candidates.filter(c=>candidateSelection.includes(c.userId)).map(c=>({url:`${base}/members`,method:'POST',body:{userId:c.userId,role},label:`Add ${c.name} (${c.email}) as ${role.replaceAll('_',' ')}`})))}>Review selected member additions</Button>
 </AdministrationDialog>}
 <AdministrationSection title="Project members and access" locked={locked}>
 {removalQueue.length>0&&<p>Reviewing {selected?.name}. Each person requires their own blocker evidence, reason and confirmation. {removalQueue.length} remaining in this review.</p>}
 {selected&&<AccountOffboarding key={selected.userId} subjectUserId={selected.userId} subjectName={selected.name} commandOwner={owner} scope={{kind:'PROJECT_ACCESS',projectId:projectId as UUID}} onLockChange={value=>{childLock.current=value;}} onResult={()=>void load()} onCancel={()=>{setSelected(undefined);setRemovalQueue([]);setMemberSelection([]);}} onNext={removalQueue.length>1?()=>{const remaining=removalQueue.filter(m=>m.userId!==selected.userId);setRemovalQueue(remaining);setSelected(remaining[0]);}:undefined}/>}
 <AdministrationRecords label="project members" rows={members} id={m=>m.userId} columns={[{key:'name',label:'Name',text:m=>m.name},{key:'email',label:'Email',text:m=>m.email},{key:'role',label:'Operational role',text:m=>m.role.replaceAll('_',' ')},{key:'access',label:'Access',text:m=>m.accountDisabledAt?'Tenant disabled':m.accessDisabledAt?'Project disabled':'Enabled'}]} selected={memberSelection} onSelection={setMemberSelection} disabled={locked} selectionActions={<Button variant="secondary" disabled={!memberSelection.length||locked||!!batch} onClick={()=>{const queue=members.filter(m=>memberSelection.includes(m.userId));setPromotion(undefined);setRemovalQueue(queue);setSelected(queue[0]);}}>Review selected access removals</Button>} actions={m=><><Button variant="secondary" disabled={locked||!!batch} onClick={()=>{setPromotion(undefined);setRemovalQueue([]);setSelected(m);}}>Preview access removal</Button>{m.role==='SURVEY_SUPERINTENDENT'&&!m.accessDisabledAt&&!m.accountDisabledAt&&<Button variant="secondary" disabled={locked||closed||!!batch} onClick={()=>{setSelected(undefined);setRemovalQueue([]);setPromotion(m);}}>Appoint as Survey Manager</Button>}</>}/>
 {promotion&&<SurveyManagerHandover key={promotion.userId} projectId={projectId} incoming={promotion} owner={owner} onLockChange={value=>{childLock.current=value;}} onResult={()=>void load()} onClose={()=>setPromotion(undefined)}/>}
 </AdministrationSection>
 <AdministrationSection title="Independent Project Admin assignments" locked={locked}>
 <p>Granting administration preserves the person's operational role. Central IT can recover a project administration vacancy.</p>
 <AdministrationRecords label="admin candidates" rows={admins} id={m=>m.userId} columns={[{key:'name',label:'Name',text:m=>m.name},{key:'email',label:'Email',text:m=>m.email},{key:'role',label:'Operational role',text:m=>m.role.replaceAll('_',' ')},{key:'grant',label:'Project Admin',text:m=>m.canAdminister?'Active grant':'No grant'}]} selected={adminSelection} onSelection={setAdminSelection} disabled={locked} eligible={m=>closed||!m.accessDisabledAt&&!m.accountDisabledAt} actions={m=><Button variant="secondary" disabled={locked||closed||!!batch||!!m.accessDisabledAt||!!m.accountDisabledAt} onClick={()=>propose({url:`${base}/administrators`,method:'POST',body:{userId:m.userId,enabled:!m.canAdminister,confirmed:true},label:`${m.canAdminister?'Revoke':'Grant'} Project Admin for ${m.name}`})}>{m.canAdminister?'Revoke Admin':'Grant Admin'}</Button>}/>
 <div className="row">{[true,false].map(enabled=><Button key={String(enabled)} variant="secondary" disabled={!adminSelection.length||locked||closed||!!batch||!!intent} onClick={()=>setBatch(admins.filter(m=>adminSelection.includes(m.userId)&&!m.accessDisabledAt&&!m.accountDisabledAt&&!!m.canAdminister!==enabled).map(m=>({url:`${base}/administrators`,method:'POST',body:{userId:m.userId,enabled,confirmed:true},label:`${enabled?'Grant':'Revoke'} Project Admin for ${m.name} (${m.email})`})))}>{enabled?'Review selected Admin grants':'Review selected Admin revocations'}</Button>)}</div>
 </AdministrationSection> </div></Card>
 <Card title="Project companies" description="Associating a company here grants no access to another project."><div className="stack">
 <AdministrationRecords label="project companies" rows={companies?.companies??[]} id={c=>c.id} columns={[{key:'name',label:'Company',text:c=>c.name,render:c=><strong>{c.name}</strong>},{key:'type',label:'Company type',text:c=>(({GC:'General contractor',SUBCONTRACTOR:'Subcontractor',OWNER_REP:'Owner representative'} as Record<string,string>)[c.type]??c.type)},{key:'id',label:'Reference',text:c=>c.id,render:c=><details><summary>Company ID</summary><span className="administration-company-id">{c.id}</span></details>}]} disabled={locked}/>
 {!closed&&<CompanyRegistration projectId={projectId} owner={owner} disabled={!template||closed||!!intent||!!batch||!!selected||!!promotion} onDone={()=>void load()}/>} </div></Card>
 {template?.project.status==='SETUP'&&!template.project.hasBeenActivated&&<Card title="Project setup"><div className="stack">
 <label className="field"><span className="field-label">Applicable template (Setup only)</span><select className="select" value={templateId} disabled={locked||template?.project.status!=='SETUP'} onChange={e=>setTemplateId(e.target.value)}><option value="">Choose a template</option>{template?.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><Button disabled={!templateId||locked||template?.project.status!=='SETUP'} onClick={()=>propose({url:`${base}/template`,method:'PATCH',body:{templateId,confirmed:true},label:'Select project template; existing setup is retained'})}>Review template selection</Button>
 </div></Card>}
 {template&&!closed&&<Card title="Project access settings"><div className="stack">
 <label className="field"><span className="field-label">Priority whitelist email</span><Input type="email" value={email} disabled={locked||closed} onChange={e=>setEmail(e.target.value)}/></label><div className="row">{(['POST','DELETE'] as const).map(method=><Button key={method} variant="secondary" disabled={!email||locked||closed} onClick={()=>propose({url:`${base}/whitelist`,method,body:{email},label:`${method==='POST'?'Add':'Remove'} ${email} ${method==='POST'?'to':'from'} priority whitelist`})}>{method==='POST'?'Review whitelist addition':'Review whitelist removal'}</Button>)}</div>
 <Button variant="danger" disabled={locked||template?.project.status!=='ACTIVE'} onClick={()=>propose({url:`${base}/archive`,method:'POST',body:{},label:'Archive this project; historical work is retained'})}>Review project archive</Button>
 </div></Card>}
 <Card title="Project diagnostics"><div className="stack"> <Button variant="secondary" disabled={locked} onClick={()=>{setDiagnosticsOpen(true);setError(undefined);apiRequest<{diagnostics:Record<string,string|number>}>(`${base}/diagnostics`).then(v=>setDiagnostics(v.diagnostics)).catch(cause=>setError(getErrorMessage(cause,'Unable to read diagnostics.')));}}>Load project diagnostics</Button>
 {diagnosticsOpen&&<AdministrationDialog title="Project diagnostics" onClose={()=>setDiagnosticsOpen(false)}>{error&&<ErrorBanner message={error}/>} {diagnostics?<dl>{Object.entries(diagnostics).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>:<p role="status">Loading diagnostics…</p>}</AdministrationDialog>}
</div></Card>
 {batch&&<AdministrationBatch actions={batch} owner={owner} onDone={()=>void load()} onCancel={()=>{setBatch(undefined);setMemberSelection([]);setAdminSelection([]);setCandidateSelection([]);void load();}}/>}
 {intent&&<AdministrationDialog title={intentResult?'Action completed':intent.label} closeDisabled={owner.blocked(token)||gate.current.pending||!!gate.current.command&&!gate.current.stale} onClose={closeIntent}
  footer={intentResult?<Button onClick={closeIntent}>Close</Button>:<><Button variant="secondary" disabled={owner.blocked(token)||gate.current.pending||!!gate.current.command&&!gate.current.stale} onClick={closeIntent}>{gate.current.stale?'Reload administration':'Cancel'}</Button><Button disabled={owner.blocked(token)||!consent||gate.current.pending||gate.current.stale} onClick={()=>void submit()}>{gate.current.pending?'Submitting…':gate.current.command?'Retry same action':'Confirm action'}</Button></>}>
  {error&&<ErrorBanner message={error}/>} {intentResult?<SuccessBanner message={intentResult}/>:<><p>Review the displayed project action before confirming. Affected authority changes require sign-in renewal.</p><label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this action applies to this project.</span></label></>}{gate.current.stale&&<p role="alert">State changed. Reload before another action.</p>}</AdministrationDialog>}
 </div>;
}
