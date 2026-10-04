'use client';
import {AdministrationArea} from './administration-workspace';
import {ProjectMemberWizard,operationalRoleLabels} from './project-member-wizard';
import {useAdministrationProgress} from '@/lib/use-administration-progress';
import {headingCase} from '@/lib/heading-case';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {FrozenCommand,CommandOwner} from '@/lib/frozen-command';
import {Button,Card,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
import {AccountOffboarding} from './account-offboarding';
import {SurveyManagerHandover} from './survey-manager-handover';
import {AdministrationSection,AdministrationRecords} from './administration-records';
import {AdministrationBatch,type AdministrationAction} from './administration-batch';
import type {UUID} from '@/shared/types';
interface Member {userId:string;name:string;email:string;role:string;accessDisabledAt:string|null;accountDisabledAt:string|null;canAdminister?:boolean}
interface Companies {companies:Array<{id:string;name:string;type:string}>;candidates:Array<{userId:string;name:string;email:string;companyName:string}>}
type Intent={url:string;method:'POST'|'PATCH'|'DELETE';body:Record<string,unknown>;label:string};
export function ProjectAdministration({projectId}:{projectId:string}){
 const owner=useRef(new CommandOwner()).current;const token='project-administration';const ownerToken=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 useAdministrationProgress(owner,`/projects/${projectId}/admin`);
 const base=`/api/projects/${projectId}`;
 const [members,setMembers]=useState<Member[]>([]),[admins,setAdmins]=useState<Member[]>([]),[companies,setCompanies]=useState<Companies>();
 const [selected,setSelected]=useState<Member>(),[promotion,setPromotion]=useState<Member>();
 const [name,setName]=useState(''),[type,setType]=useState('SUBCONTRACTOR'),[companyId,setCompanyId]=useState(''),[role,setRole]=useState('REQUESTER'),[email,setEmail]=useState('');
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
 function propose(value:Intent){if(locked||childLock.current||closed||batch)return;setIntent(value);setConsent(false);setSuccess(undefined);}
 async function submit(){if(!intent||!owner.claim(token))return;const frozen=gate.current.begin(intent,crypto.randomUUID());if(!frozen){if(!gate.current.locked)owner.release(token);return;}setRevision(n=>n+1);setError(undefined);
  try{await apiRequest(frozen.body.url,{method:frozen.body.method,body:frozen.body.body,headers:{'Idempotency-Key':frozen.key}});gate.current.success();setSuccess(`${frozen.body.label} completed. Affected authority changes require sign-in renewal.`);setIntent(undefined);setConsent(false);void load();}
  catch(cause){gate.current.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The outcome is uncertain. Retry the same action.'));}
  finally{if(!gate.current.locked)owner.release(token);setRevision(n=>n+1);}
 }
 void revision;
 return <div className="stack">
 <AdministrationArea id="admin-personnel"><Card title="Project Personnel Administration" description="Membership, operational roles and independent Project Admin authority are separate."><div className="stack">
 {error&&<ErrorBanner message={error}/>} {success&&<SuccessBanner message={success}/>} {loading&&<p role="status">Loading project administration…</p>}
 {closed&&<p>This archived project retains history. Access removal remains available; other administration is read-only.</p>}
 <AdministrationSection title="Add a Project Member" open locked={locked} description="Associate the person's company with this project first. Select eligible accounts, then review their project role.">
 {!loading&&!closed&&<ProjectMemberWizard projectId={projectId} companies={companies?.companies??[]} owner={owner} onCreated={()=>void load()}/>}
 <AdministrationRecords scrollable label="eligible accounts" rows={companies?.candidates??[]} id={c=>c.userId} columns={[{key:'name',label:'Name',text:c=>c.name},{key:'email',label:'Email',text:c=>c.email},{key:'company',label:'Company',text:c=>c.companyName}]} selected={candidateSelection} onSelection={setCandidateSelection} disabled={locked} eligible={()=>true}/>
 <label className="field"><span className="field-label">Operational role</span><select className="select" size={4} value={role} disabled={locked||closed} onChange={e=>setRole(e.target.value)}>{['REQUESTER','SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','CAD_TECHNICIAN','CAD_LEAD','VIEWER'].map(r=><option key={r} value={r}>{operationalRoleLabels[r]??r}</option>)}</select></label>
 <Button disabled={!candidateSelection.length||locked||closed||!!batch||!!intent} onClick={()=>setBatch(companies?.candidates.filter(c=>candidateSelection.includes(c.userId)).map(c=>({url:`${base}/members`,method:'POST',body:{userId:c.userId,role},label:`Add ${c.name} (${c.email}) as ${role.replaceAll('_',' ')}`})))}>Review selected member additions</Button>
 </AdministrationSection>
 <AdministrationSection title="Project Members and Access" locked={locked}>
 {removalQueue.length>0&&<p>Reviewing {selected?.name}. Each person requires their own blocker evidence, reason and confirmation. {removalQueue.length} remaining in this review.</p>}
 {selected&&<AccountOffboarding key={selected.userId} subjectUserId={selected.userId} subjectName={selected.name} commandOwner={owner} scope={{kind:'PROJECT_ACCESS',projectId:projectId as UUID}} onLockChange={value=>{childLock.current=value;}} onResult={()=>void load()} onCancel={()=>{setSelected(undefined);setRemovalQueue([]);setMemberSelection([]);}}/>}
 {selected&&<Button variant="secondary" disabled={locked} onClick={()=>{const remaining=removalQueue.filter(m=>m.userId!==selected.userId);setRemovalQueue(remaining);setSelected(remaining[0]);}}> {removalQueue.length>1?'Review next selected person':'Close access review'}</Button>}
 <AdministrationRecords scrollable label="project members" rows={members} id={m=>m.userId} columns={[{key:'name',label:'Name',text:m=>m.name},{key:'email',label:'Email',text:m=>m.email},{key:'role',label:'Operational role',text:m=>operationalRoleLabels[m.role]??m.role},{key:'access',label:'Access',className:'administration-state-column',text:m=>m.accountDisabledAt?'Tenant disabled':m.accessDisabledAt?'Project disabled':'Enabled',render:m=><span className="badge badge-neutral">{m.accountDisabledAt?'Tenant Disabled':m.accessDisabledAt?'Project Disabled':'Enabled'}</span>}]} selected={memberSelection} onSelection={setMemberSelection} disabled={locked} selectionActions={<Button variant="secondary" disabled={!memberSelection.length||locked||!!batch} onClick={()=>{const queue=members.filter(m=>memberSelection.includes(m.userId));setPromotion(undefined);setRemovalQueue(queue);setSelected(queue[0]);}}>Review selected access removals</Button>} actions={m=><><Button variant="secondary" disabled={locked||!!batch} onClick={()=>{setPromotion(undefined);setRemovalQueue([]);setSelected(m);}}>Preview access removal</Button>{m.role==='SURVEY_SUPERINTENDENT'&&!m.accessDisabledAt&&!m.accountDisabledAt&&<Button variant="secondary" disabled={locked||closed||!!batch} onClick={()=>{setSelected(undefined);setRemovalQueue([]);setPromotion(m);}}>Appoint as Survey Manager</Button>}</>}/>
 {promotion&&<SurveyManagerHandover key={promotion.userId} projectId={projectId} incoming={promotion} owner={owner} onLockChange={value=>{childLock.current=value;}} onResult={()=>void load()}/>}
 </AdministrationSection>
 </div></Card></AdministrationArea>
 <AdministrationArea id="admin-administrators"><Card title="Project Admin Assignments" description="Create an administrator account or grant independent administration to an eligible existing project member."><div className="stack">
 {!loading&&!closed&&<ProjectMemberWizard projectId={projectId} companies={companies?.companies??[]} owner={owner} onCreated={()=>void load()} initialAdmin/>}
 <AdministrationSection title="Independent Project Admin Assignments" locked={locked} description="Granting administration preserves the person's operational role. Central IT can recover a project administration vacancy.">
 <AdministrationRecords scrollable label="admin candidates" rows={admins} id={m=>m.userId} columns={[{key:'name',label:'Name',text:m=>m.name},{key:'email',label:'Email',text:m=>m.email},{key:'role',label:'Operational role',text:m=>operationalRoleLabels[m.role]??m.role},{key:'grant',label:'Project Admin',className:'administration-state-column',text:m=>m.canAdminister?'Active grant':'No grant',render:m=><span className="badge badge-neutral">{m.canAdminister?'Active Grant':'No Grant'}</span>}]} selected={adminSelection} onSelection={setAdminSelection} disabled={locked} eligible={m=>closed||!m.accessDisabledAt&&!m.accountDisabledAt} actions={m=><Button variant="secondary" disabled={locked||closed||!!batch||!!m.accessDisabledAt||!!m.accountDisabledAt} onClick={()=>propose({url:`${base}/administrators`,method:'POST',body:{userId:m.userId,enabled:!m.canAdminister,confirmed:true},label:`${m.canAdminister?'Revoke':'Grant'} Project Admin for ${m.name}`})}>{m.canAdminister?'Revoke Admin':'Grant Admin'}</Button>}/>
 <div className="row">{[true,false].map(enabled=><Button key={String(enabled)} variant="secondary" disabled={!adminSelection.length||locked||closed||!!batch||!!intent} onClick={()=>setBatch(admins.filter(m=>adminSelection.includes(m.userId)&&!m.accessDisabledAt&&!m.accountDisabledAt&&!!m.canAdminister!==enabled).map(m=>({url:`${base}/administrators`,method:'POST',body:{userId:m.userId,enabled,confirmed:true},label:`${enabled?'Grant':'Revoke'} Project Admin for ${m.name} (${m.email})`})))}>{enabled?'Review selected Admin grants':'Review selected Admin revocations'}</Button>)}</div>
 </AdministrationSection> </div></Card></AdministrationArea>
 <AdministrationArea id="admin-companies"><Card title="Project Companies" description="Associating a company here grants no access to another project."><div className="stack">
 <AdministrationRecords scrollable label="project companies" rows={companies?.companies??[]} id={c=>c.id} columns={[{key:'name',label:'Company',text:c=>c.name,render:c=><strong>{c.name}</strong>},{key:'type',label:'Company type',text:c=>(({GC:'General contractor',SUBCONTRACTOR:'Subcontractor',OWNER_REP:'Owner representative'} as Record<string,string>)[c.type]??c.type)},{key:'id',label:'Reference',text:c=>c.id,render:c=><details><summary>Company ID</summary><span className="administration-company-id">{c.id}</span></details>}]} disabled={locked}/>
 {!closed&&<AdministrationSection title="Register or Associate a Company" open locked={locked}>
 <label className="field"><span className="field-label">New company name</span><Input value={name} maxLength={200} disabled={locked||closed} onChange={e=>setName(e.target.value)}/></label>
 <label className="field"><span className="field-label">Company type</span><select className="select" value={type} disabled={locked||closed} onChange={e=>setType(e.target.value)}>{['GC','SUBCONTRACTOR','OWNER_REP'].map(t=><option key={t} value={t}>{{GC:"General Contractor",SUBCONTRACTOR:"Subcontractor",OWNER_REP:"Owner Representative"}[t]}</option>)}</select></label>
 <Button disabled={!name.trim()||locked||closed} onClick={()=>propose({url:`${base}/companies`,method:'POST',body:{name:name.trim(),type,confirmed:true},label:`Register ${name.trim()} for this project`})}>Review company registration</Button>
 <label className="field"><span className="field-label">Existing company ID</span><Input value={companyId} disabled={locked||closed} onChange={e=>setCompanyId(e.target.value)}/></label><Button disabled={!companyId||locked||closed} onClick={()=>propose({url:`${base}/companies`,method:'POST',body:{companyId,confirmed:true},label:'Associate existing company with this project'})}>Review company association</Button>
 </AdministrationSection>} </div></Card></AdministrationArea>
 <AdministrationArea id="admin-settings" className="administration-settings-grid">{template?.project.status==='SETUP'&&!template.project.hasBeenActivated&&<Card title="Project Setup"><div className="stack">
 <label className="field"><span className="field-label">Applicable template (Setup only)</span><select className="select" value={templateId} disabled={locked||template?.project.status!=='SETUP'} onChange={e=>setTemplateId(e.target.value)}><option value="">Choose a template</option>{template?.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><Button disabled={!templateId||locked||template?.project.status!=='SETUP'} onClick={()=>propose({url:`${base}/template`,method:'PATCH',body:{templateId,confirmed:true},label:'Select project template; existing setup is retained'})}>Review template selection</Button>
 </div></Card>}
 {template&&!closed&&<Card title="Project Access Settings"><div className="stack">
 <label className="field"><span className="field-label">Priority whitelist email</span><Input type="email" value={email} disabled={locked||closed} onChange={e=>setEmail(e.target.value)}/></label><div className="row">{(['POST','DELETE'] as const).map(method=><Button key={method} variant="secondary" disabled={!email||locked||closed} onClick={()=>propose({url:`${base}/whitelist`,method,body:{email},label:`${method==='POST'?'Add':'Remove'} ${email} ${method==='POST'?'to':'from'} priority whitelist`})}>{method==='POST'?'Review whitelist addition':'Review whitelist removal'}</Button>)}</div>
 <Button variant="danger" disabled={locked||template?.project.status!=='ACTIVE'} onClick={()=>propose({url:`${base}/archive`,method:'POST',body:{},label:'Archive this project; historical work is retained'})}>Review project archive</Button>
 </div></Card>}
 </AdministrationArea><AdministrationArea id="admin-diagnostics"><Card title="Project Diagnostics"><div className="stack"> <Button variant="secondary" disabled={locked} onClick={()=>{apiRequest<{diagnostics:Record<string,string|number>}>(`${base}/diagnostics`).then(v=>setDiagnostics(v.diagnostics)).catch(cause=>setError(getErrorMessage(cause,'Unable to read diagnostics.')));}}>Load project diagnostics</Button>
 {diagnostics&&<dl>{Object.entries(diagnostics).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>}
</div></Card></AdministrationArea>
 {batch&&<AdministrationBatch actions={batch} owner={owner} onDone={()=>void load()} onCancel={()=>{setBatch(undefined);setMemberSelection([]);setAdminSelection([]);setCandidateSelection([]);void load();}}/>}
 {intent&&<section className="stack administration-command-review" aria-label="Confirm project administration"><h3 className="panel-title">{headingCase(intent.label)}</h3><label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this action applies to this project.</span></label><div className="row"><Button disabled={owner.blocked(token)||!consent||gate.current.pending||gate.current.stale} onClick={()=>void submit()}>{gate.current.pending?'Submitting…':gate.current.command?'Retry same action':'Confirm action'}</Button><Button variant="secondary" disabled={owner.blocked(token)||gate.current.pending||!!gate.current.command&&!gate.current.stale} onClick={()=>{if(!owner.blocked(token)&&gate.current.reload()){owner.release(token);setIntent(undefined);setConsent(false);void load();}}}>Reload administration</Button></div>{gate.current.stale&&<p role="alert">State changed. Reload before another action.</p>}</section>}
 </div>;
}
