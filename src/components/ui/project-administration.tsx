'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {FrozenCommand,CommandOwner} from '@/lib/frozen-command';
import {Button,Card,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
import {AccountOffboarding} from './account-offboarding';
import {RequesterInvitations} from './requester-invitations';
import type {UUID} from '@/shared/types';
interface Member {userId:string;name:string;email:string;role:string;accessDisabledAt:string|null;accountDisabledAt:string|null;canAdminister?:boolean}
interface Companies {companies:Array<{id:string;name:string;type:string}>;candidates:Array<{userId:string;name:string;email:string;companyName:string}>}
type Intent={url:string;method:'POST'|'PATCH'|'DELETE';body:Record<string,unknown>;label:string};
export function ProjectAdministration({projectId}:{projectId:string}){
 const owner=useRef(new CommandOwner()).current;const token='project-administration';const ownerToken=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const base=`/api/projects/${projectId}`;
 const [members,setMembers]=useState<Member[]>([]),[admins,setAdmins]=useState<Member[]>([]),[companies,setCompanies]=useState<Companies>();
 const [selected,setSelected]=useState<Member>(),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[total,setTotal]=useState(0);
 const [name,setName]=useState(''),[type,setType]=useState('SUBCONTRACTOR'),[companyId,setCompanyId]=useState(''),[candidate,setCandidate]=useState(''),[role,setRole]=useState('REQUESTER'),[email,setEmail]=useState('');
 const [templateId,setTemplateId]=useState(''),[template,setTemplate]=useState<{templates:Array<{id:string;name:string}>;project:{status:string;templateId:string|null}}>();
 const [diagnostics,setDiagnostics]=useState<Record<string,string|number>>(),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>(),[intent,setIntent]=useState<Intent>(),[consent,setConsent]=useState(false),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false);
 const [childLocked,setChildLocked]=useState(false);const childLock=useRef(false);
 const gate=useRef(new FrozenCommand<Intent>()),generation=useRef(0);
 async function load(){const epoch=++generation.current;setLoading(true);setError(undefined);
  try{const results=await Promise.all([apiRequest<{members:Member[];total:number}>(`${base}/members?includeDisabled=true&limit=25&offset=${offset}&search=${encodeURIComponent(search)}`),apiRequest<{administrators:Member[]}>(`${base}/administrators`),apiRequest<Companies>(`${base}/companies`),apiRequest<NonNullable<typeof template>>(`${base}/template`)]);
   if(epoch!==generation.current)return;setMembers(results[0].members);setTotal(results[0].total);setAdmins(results[1].administrators);setCompanies(results[2]);setTemplate(results[3]);setTemplateId(results[3].project.templateId??'');
  }catch(cause){if(epoch===generation.current)setError(getErrorMessage(cause,'Unable to load project administration.'));}
  finally{if(epoch===generation.current)setLoading(false);}
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[projectId,offset,search]);
 const closed=template?.project.status==='ARCHIVED';
 const locked=gate.current.locked||ownerToken!==null;
 function propose(value:Intent){if(locked||childLock.current||closed)return;setIntent(value);setConsent(false);setSuccess(undefined);}
 async function submit(){if(!intent||!owner.claim(token))return;const frozen=gate.current.begin(intent,crypto.randomUUID());if(!frozen){if(!gate.current.locked)owner.release(token);return;}setRevision(n=>n+1);setError(undefined);
  try{await apiRequest(frozen.body.url,{method:frozen.body.method,body:frozen.body.body,headers:{'Idempotency-Key':frozen.key}});gate.current.success();setSuccess(`${frozen.body.label} completed. Affected authority changes require sign-in renewal.`);setIntent(undefined);setConsent(false);void load();}
  catch(cause){gate.current.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The outcome is uncertain. Retry the same action.'));}
  finally{if(!gate.current.locked)owner.release(token);setRevision(n=>n+1);}
 }
 void revision;
 return <div className="stack">
 {error&&<ErrorBanner message={error}/>} {success&&<SuccessBanner message={success}/>} {loading&&<p role="status">Loading project administration…</p>}
 {closed&&<p>This archived project retains history. Access removal remains available; other administration is read-only.</p>}
 <RequesterInvitations key={projectId} projectId={projectId} commandOwner={owner}/>
 <details className="panel project-admin-section">
 <summary><h2 className="panel-title">Add a project member</h2></summary>
 <div className="stack project-admin-section-content"><p>Associate the person's company with this project first. Up to 100 eligible candidates are shown.</p>
 <label className="field"><span className="field-label">Person</span><select className="select" value={candidate} disabled={locked||closed} onChange={e=>setCandidate(e.target.value)}><option value="">Choose a person</option>{companies?.candidates.map(c=><option key={c.userId} value={c.userId}>{c.name} · {c.companyName}</option>)}</select></label>
 <label className="field"><span className="field-label">Operational role</span><select className="select" value={role} disabled={locked||closed} onChange={e=>setRole(e.target.value)}>{['REQUESTER','SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','CAD_TECHNICIAN','CAD_LEAD','VIEWER'].map(r=><option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></label>
 <Button disabled={!candidate||locked||closed} onClick={()=>propose({url:`${base}/members`,method:'POST',body:{userId:candidate,role},label:'Add project member'})}>Review member addition</Button>
 </div></details>
 <details className="panel project-admin-section">
 <summary><h2 className="panel-title">Independent Project Admin assignments</h2></summary>
 <div className="stack project-admin-section-content"><p>Granting administration preserves the person's operational role.</p>
 <ul className="tm-list">{admins.map(m=><li key={m.userId}>{m.name} · {m.role.replaceAll('_',' ')} · {m.canAdminister?'Admin grant active':'No admin grant'} <Button variant="secondary" disabled={locked||closed||!!m.accessDisabledAt||!!m.accountDisabledAt} onClick={()=>propose({url:`${base}/administrators`,method:'POST',body:{userId:m.userId,enabled:!m.canAdminister,confirmed:true},label:`${m.canAdminister?'Revoke':'Grant'} Project Admin for ${m.name}`})}>{m.canAdminister?'Revoke Admin':'Grant Admin'}</Button></li>)}</ul>
 </div></details>
 <details className="panel project-admin-section">
 <summary><h2 className="panel-title">Project members and access</h2></summary>
 <div className="stack project-admin-section-content">
 <p className="muted">Membership, operational roles and independent Project Admin authority are separate.</p>
 <label className="field"><span className="field-label">Find a project member</span><Input value={search} maxLength={100} disabled={locked} onChange={e=>{setSearch(e.target.value);setOffset(0);setSelected(undefined);}}/></label>
 <ul className="tm-list">{members.map(m=><li key={m.userId}><strong>{m.name}</strong> · {m.email} · {m.role.replaceAll('_',' ')}{m.accountDisabledAt?' · Tenant account disabled':m.accessDisabledAt?' · Project access disabled':''} <Button variant="secondary" disabled={locked} onClick={()=>setSelected(m)}>Preview access removal</Button></li>)}</ul>
 {!loading&&!members.length&&<p>No matching project members.</p>}
 <div className="row"><Button variant="secondary" disabled={locked||offset===0} onClick={()=>setOffset(n=>Math.max(0,n-25))}>Previous members</Button><span>{offset+1}–{Math.min(offset+members.length,total)} of {total}</span><Button variant="secondary" disabled={locked||offset+25>=total} onClick={()=>setOffset(n=>n+25)}>Next members</Button></div>
 {selected&&<AccountOffboarding key={selected.userId} subjectUserId={selected.userId} subjectName={selected.name} commandOwner={owner} scope={{kind:'PROJECT_ACCESS',projectId:projectId as UUID}} onLockChange={value=>{childLock.current=value;setChildLocked(value);}} onResult={()=>void load()}/>}
 </div></details>
 <Card title="Project companies" description="Associating a company here grants no access to another project."><div className="stack">
 <ul>{companies?.companies.map(c=><li key={c.id}>{c.name} · {c.type} · {c.id}</li>)}</ul>
 <label className="field"><span className="field-label">New company name</span><Input value={name} maxLength={200} disabled={locked||closed} onChange={e=>setName(e.target.value)}/></label>
 <label className="field"><span className="field-label">Company type</span><select className="select" value={type} disabled={locked||closed} onChange={e=>setType(e.target.value)}>{['GC','SUBCONTRACTOR','OWNER_REP'].map(t=><option key={t}>{t}</option>)}</select></label>
 <Button disabled={!name.trim()||locked||closed} onClick={()=>propose({url:`${base}/companies`,method:'POST',body:{name:name.trim(),type,confirmed:true},label:`Register ${name.trim()} for this project`})}>Review company registration</Button>
 <label className="field"><span className="field-label">Existing company ID</span><Input value={companyId} disabled={locked||closed} onChange={e=>setCompanyId(e.target.value)}/></label><Button disabled={!companyId||locked||closed} onClick={()=>propose({url:`${base}/companies`,method:'POST',body:{companyId,confirmed:true},label:'Associate existing company with this project'})}>Review company association</Button>
 </div></Card>
 <Card title="Project configuration and diagnostics"><div className="stack">
 <label className="field"><span className="field-label">Applicable template (Setup only)</span><select className="select" value={templateId} disabled={locked||template?.project.status!=='SETUP'} onChange={e=>setTemplateId(e.target.value)}><option value="">Choose a template</option>{template?.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><Button disabled={!templateId||locked||template?.project.status!=='SETUP'} onClick={()=>propose({url:`${base}/template`,method:'PATCH',body:{templateId,confirmed:true},label:'Select project template; existing setup is retained'})}>Review template selection</Button>
 <label className="field"><span className="field-label">Priority whitelist email</span><Input type="email" value={email} disabled={locked||closed} onChange={e=>setEmail(e.target.value)}/></label><div className="row">{(['POST','DELETE'] as const).map(method=><Button key={method} variant="secondary" disabled={!email||locked||closed} onClick={()=>propose({url:`${base}/whitelist`,method,body:{email},label:`${method==='POST'?'Add':'Remove'} ${email} ${method==='POST'?'to':'from'} priority whitelist`})}>{method==='POST'?'Review whitelist addition':'Review whitelist removal'}</Button>)}</div>
 <Button variant="secondary" disabled={locked} onClick={()=>{apiRequest<{diagnostics:Record<string,string|number>}>(`${base}/diagnostics`).then(v=>setDiagnostics(v.diagnostics)).catch(cause=>setError(getErrorMessage(cause,'Unable to read diagnostics.')));}}>Load project diagnostics</Button>
 {diagnostics&&<dl>{Object.entries(diagnostics).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>}
 <Button variant="danger" disabled={locked||template?.project.status!=='ACTIVE'} onClick={()=>propose({url:`${base}/archive`,method:'POST',body:{},label:'Archive this project; historical work is retained'})}>Review project archive</Button>
 </div></Card>
 {intent&&<section className="stack" aria-label="Confirm project administration"><h3 className="panel-title">{intent.label}</h3><label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this action applies to this project.</span></label><div className="row"><Button disabled={owner.blocked(token)||!consent||gate.current.pending||gate.current.stale} onClick={()=>void submit()}>{gate.current.pending?'Submitting…':gate.current.command?'Retry same action':'Confirm action'}</Button><Button variant="secondary" disabled={owner.blocked(token)||gate.current.pending||!!gate.current.command&&!gate.current.stale} onClick={()=>{if(!owner.blocked(token)&&gate.current.reload()){owner.release(token);setIntent(undefined);setConsent(false);void load();}}}>Reload administration</Button></div>{gate.current.stale&&<p role="alert">State changed. Reload before another action.</p>}</section>}
 </div>;
}
