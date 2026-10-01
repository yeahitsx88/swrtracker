'use client';
import {useEffect,useRef,useState} from 'react';
import {apiClient} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {Button,ErrorBanner,SuccessBanner} from '@/components/ui';
import {PaginationControls} from '@/components/forms';
import {MemberKpiEntry} from './member-kpi-entry';
import type {WorkforcePerson,WorkforceMove} from '@/modules/tenancy/application/survey-workforce';
import type {Page,UUID} from '@/shared/types';
import type {ProjectRole} from '@/modules/identity/domain/types';
import './team-management.css';
function useWorkforcePage(projectId:string,search:string,offset:number,limit:number,revision:number){
 const [data,setData]=useState<Page<WorkforcePerson>>(),[error,setError]=useState<string>();
 useEffect(()=>{let active=true;setData(undefined);setError(undefined);apiClient.workforce(projectId,{search,offset,limit}).then(value=>{if(active)setData(value);}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to load current assigned personnel.'));});return()=>{active=false;};},[projectId,search,offset,limit,revision]);
 return {data,error};
}
export function AssignedWorkforce({projectId,role,archived}:{projectId:string;role:ProjectRole;archived:boolean}){
 const [search,setSearch]=useState(''),[draft,setDraft]=useState(''),[offset,setOffset]=useState(0),[limit,setLimit]=useState(10),[revision,setRevision]=useState(0);
 const [moving,setMoving]=useState<WorkforcePerson>(),[snapshot,setSnapshot]=useState<string>(),[target,setTarget]=useState<UUID>(),[chiefOffset,setChiefOffset]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>();
 const attempt=useRef<{input:WorkforceMove;key:string}|undefined>(undefined);
 const page=useWorkforcePage(projectId,search,offset,limit,revision);
 const chiefs=useWorkforcePage(projectId,'PARTY CHIEF',chiefOffset,10,revision);
 const superintendent=role==='SURVEY_SUPERINTENDENT';
 async function openMove(person:WorkforcePerson){
 setMoving(person);setSnapshot(undefined);setTarget(undefined);setError(undefined);setSuccess(undefined);attempt.current=undefined;
 try{const value=await apiClient.workforceContext(projectId);setSnapshot(value.snapshotToken);}
 catch(cause){setError(getErrorMessage(cause,'Unable to check current staffing. Reload your workforce.'));}
 }
 function reload(){setMoving(undefined);setError(undefined);attempt.current=undefined;setRevision(n=>n+1);}
 async function save(){
 if(!moving||!snapshot||!target||busy)return;setBusy(true);setError(undefined);
 if(!attempt.current)attempt.current={input:{instrumentManId:moving.userId,partyChiefId:target,expectedSnapshot:snapshot},key:crypto.randomUUID()};
 try{await apiClient.moveWorkforceMember(projectId,attempt.current.input,attempt.current.key);setSuccess('Crew reassignment saved. Your assigned workforce and request history are retained.');reload();}
 catch(cause){setError(getErrorMessage(cause,'Unable to save. Retry the unchanged reassignment or reload current staffing.'));if(cause instanceof ApiClientError&&cause.status<500){attempt.current=undefined;setSnapshot(undefined);}}
 finally{setBusy(false);}
 }
 return <section className="panel tm-workspace stack" aria-labelledby="assigned-team-title">
 <h2 id="assigned-team-title" className="panel-title">Team Management</h2>
 <p className="muted">{superintendent?'Your explicitly assigned Party Chiefs and their current Instrument Men. Reassign Instrument Men only between Chiefs already assigned to you.':'Your currently assigned Instrument Men. This view does not change staffing.'}</p>
 {success?<SuccessBanner message={success}/>:null}
 {moving?<div className="stack tm-editor"><h3>Reassign {moving.name}</h3><p>Choose a Party Chief from your current assigned workforce.</p>
 {chiefs.error?<ErrorBanner message={chiefs.error}/>:!chiefs.data?<p role="status">Loading assigned Chiefs…</p>:<><ul className="tm-list">{chiefs.data.data.filter(p=>p.role==='PARTY_CHIEF').map(p=><li key={p.userId}><Button variant="secondary" aria-pressed={target===p.userId} disabled={busy||!!attempt.current||p.userId===moving.partyChiefId} onClick={()=>setTarget(p.userId)}>{p.name}{p.userId===moving.partyChiefId?' · Current Chief':''}</Button></li>)}</ul><PaginationControls total={chiefs.data.total} limit={10} offset={chiefOffset} onChange={setChiefOffset}/></>}
 {error?<ErrorBanner message={error}/>:null}
 <div className="row"><Button disabled={busy||!target||!snapshot} onClick={()=>void save()}>{busy?'Saving…':'Save reassignment'}</Button><Button variant="secondary" disabled={busy} onClick={reload}>Reload workforce</Button></div></div>:<>
 <form className="tm-search" onSubmit={e=>{e.preventDefault();setSearch(draft.trim());setOffset(0);}}>
 <label className="field tm-search-text"><span className="field-label">Search assigned personnel</span><input className="input" value={draft} maxLength={120} onChange={e=>setDraft(e.target.value)}/></label>
 <label className="field"><span className="field-label">Items per page</span><select className="select" value={limit} onChange={e=>{setLimit(Number(e.target.value));setOffset(0);}}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select></label><Button type="submit" variant="secondary">Search</Button></form>
 {page.error?<><ErrorBanner message={page.error}/><Button variant="secondary" onClick={reload}>Retry workforce</Button></>:!page.data?<p role="status">Loading assigned personnel…</p>:<>
 {page.data.total===0?<p>No current assigned personnel match. Ask the Survey Manager to review your explicit staffing assignments.</p>:null}
 <ul className="tm-list">{page.data.data.map(person=><li className="tm-person" key={person.userId}><div><strong>{person.name}</strong><span className="tm-email muted">{person.email}</span></div><div>{person.role==='PARTY_CHIEF'?'Party Chief':'Instrument Man'}</div><div className="tm-person-actions"><MemberKpiEntry projectId={projectId} person={person} role={role}/>{superintendent&&!archived&&person.role==='INSTRUMENT_MAN'?<Button variant="secondary" aria-label={`Reassign ${person.name}`} onClick={()=>void openMove(person)}>Reassign crew</Button>:null}</div></li>)}</ul>
 <PaginationControls total={page.data.total} offset={offset} limit={limit} onChange={setOffset}/></>}
 </>}
 </section>;
}
