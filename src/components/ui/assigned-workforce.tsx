'use client';
import {HeadingHelp} from '@/components/ui/heading-help';
import {RecordCollection} from '@/components/ui/record-collection';
import {useEffect,useRef,useState} from 'react';
import {useAdministrationProgress} from '@/lib/use-administration-progress';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {apiClient,apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {Button,ErrorBanner,SuccessBanner} from '@/components/ui';
import {PaginationControls} from '@/components/forms';
import {MemberKpiEntry} from './member-kpi-entry';
import type {WorkforcePerson,WorkforceMove,WorkforcePage} from '@/modules/tenancy/application/survey-workforce';
import type {ProjectRole} from '@/modules/identity/domain/types';
import './team-management.css';
function useWorkforcePage(projectId:string,search:string,offset:number,limit:number,revision:number){
 const [data,setData]=useState<WorkforcePage>(),[error,setError]=useState<string>();
 useEffect(()=>{let active=true;setData(undefined);setError(undefined);apiClient.workforce(projectId,{search,offset,limit}).then(value=>{if(active)setData(value);}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to load current assigned personnel.'));});return()=>{active=false;};},[projectId,search,offset,limit,revision]);
 return {data,error};
}
export function AssignedWorkforce({projectId,role,archived,onEditingChange,initialReview,onCommitted,onReviewReloaded}:{initialReview?:{person:WorkforcePerson;target:WorkforcePerson;snapshot:string};onCommitted?:()=>void;onReviewReloaded?:()=>void;projectId:string;role:ProjectRole;archived:boolean;onEditingChange?:(editing:boolean)=>void}){
 const [search,setSearch]=useState(''),[draft,setDraft]=useState(''),[offset,setOffset]=useState(0),[limit,setLimit]=useState(10),[revision,setRevision]=useState(0);
 const [moving,setMoving]=useState<WorkforcePerson|undefined>(initialReview?.person),[snapshot,setSnapshot]=useState<string|undefined>(initialReview?.snapshot),[target,setTarget]=useState<WorkforcePerson|undefined>(initialReview?.target),[chiefOffset,setChiefOffset]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>(),[confirmed,setConfirmed]=useState(false),[closed,setClosed]=useState(archived),[currentChief,setCurrentChief]=useState<WorkforcePerson>(),[readFailed,setReadFailed]=useState(false);
 const gate=useRef(new FrozenCommand<WorkforceMove>()).current,owner=useRef(new CommandOwner()).current;
 useAdministrationProgress(owner,`/projects/${projectId}/survey/teams`);
 const page=useWorkforcePage(projectId,search,offset,limit,revision);
 const chiefs=useWorkforcePage(projectId,'PARTY CHIEF',chiefOffset,10,revision);
 const superintendent=role==='SURVEY_SUPERINTENDENT';
 useEffect(()=>{if(initialReview)onEditingChange?.(true);},[]);
 useEffect(()=>{let active=true;setCurrentChief(undefined);if(!moving?.partyChiefId)return;apiRequest<{person:WorkforcePerson}>(`/api/projects/${projectId}/survey/workforce?mode=person&personId=${moving.partyChiefId}`).then(value=>{if(active)setCurrentChief(value.person);}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to read the current Chief identity. Reload workforce before reviewing this move.'));});return()=>{active=false;};},[projectId,moving?.partyChiefId]);
 function openMove(person:WorkforcePerson,expectedSnapshot:string){
 onEditingChange?.(true);
 setMoving(person);setSnapshot(expectedSnapshot);setTarget(undefined);setError(undefined);setSuccess(undefined);setConfirmed(false);setReadFailed(false);
 }
 async function reload(){
 if(busy||gate.pending||gate.command&&!gate.stale)return;setBusy(true);setError(undefined);setReadFailed(false);
 try{const [context]=await Promise.all([apiClient.workforceContext(projectId),apiClient.workforce(projectId,{search:'',offset:0,limit}),apiClient.workforce(projectId,{search:'PARTY CHIEF',offset:0,limit:10})]);if(!gate.reload())return;setClosed(context.project.status==='ARCHIVED');setMoving(undefined);setSnapshot(undefined);setTarget(undefined);setConfirmed(false);setChiefOffset(0);setRevision(n=>n+1);owner.release('crew');onEditingChange?.(false);onReviewReloaded?.();}
 catch(cause){setReadFailed(true);setError(getErrorMessage(cause,'Unable to read current workforce. Keep this reassignment open and try again.'));}
 finally{setBusy(false);}
 }
 async function save(){
 if(!moving||!snapshot||!target||busy||gate.stale||(!gate.command&&!confirmed)||closed||moving.partyChiefId&&!currentChief)return;
 const command=gate.begin({instrumentManId:moving.userId,partyChiefId:target.userId,expectedSnapshot:snapshot},crypto.randomUUID());if(!command)return;
 owner.claim('crew');setBusy(true);setError(undefined);
 try{await apiClient.moveWorkforceMember(projectId,command.body,command.key);gate.success();owner.release('crew');setSuccess('Crew reassignment saved. Your assigned workforce and request history are retained.');setMoving(undefined);setConfirmed(false);setRevision(n=>n+1);onEditingChange?.(false);onCommitted?.();}
 catch(cause){gate.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'Unable to save. Retry the unchanged reassignment or reload current staffing.'));if(!gate.locked)owner.release('crew');}
 finally{setBusy(false);}
 }
 return <section className="panel tm-workspace stack" aria-labelledby="assigned-team-title">
 <HeadingHelp label="Team Management" heading={<h2 id="assigned-team-title" className="panel-title">Team Management</h2>} help={superintendent?'View the Chiefs and Instrument Men on your team. Assign an Instrument Man to a Chief within the same team. Your Survey Manager is notified when you make a change.':'Your currently assigned Instrument Men. This view does not change staffing.'}/>
 {success?<SuccessBanner message={success}/>:null}
 {moving?<div className="stack tm-editor"><HeadingHelp label={"Reassign"} heading={<h3>Reassign {moving.name}</h3>} help={<span>Choose a Chief from the same team. Only the Survey Manager can move people between teams.</span>}/>
 {chiefs.error?<ErrorBanner message={chiefs.error}/>:!chiefs.data?<p role="status">Loading assigned Chiefs…</p>:<><RecordCollection label="replacement Party Chiefs" records={<>{chiefs.data.data.filter(p=>p.role==='PARTY_CHIEF').map(p=><li key={p.userId}><Button variant="secondary" aria-pressed={target?.userId===p.userId} disabled={busy||gate.locked||p.userId===moving.partyChiefId} onClick={()=>{setTarget(p);setConfirmed(false);}}>{p.name}{p.userId===moving.partyChiefId?' · Current Chief':''}</Button></li>)}</>}/><fieldset disabled={busy||gate.locked}><PaginationControls total={chiefs.data.total} limit={10} offset={chiefOffset} onChange={setChiefOffset}/></fieldset></>}
 <p>Current Chief: {moving.partyChiefId?`${currentChief?.name??'Reading current Chief identity…'} (${moving.partyChiefId})`:'No Chief'}. New Chief: {target?`${target.name} (${target.userId})`:'Choose a Chief'}.</p>{moving.partyChiefId&&!currentChief&&error?<p role="alert">The current Chief identity could not be read. Keep this review open and reload workforce before deciding.</p>:null}<p>This changes the current crew link within your team. Existing request assignments retain their recorded Chief; request history stays unchanged. Your Survey Manager is notified.</p>
 <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={busy||gate.locked} onChange={e=>setConfirmed(e.target.checked)}/><span>I confirm this crew reassignment.</span></label>
 {gate.stale?<p role="alert">{readFailed?'Current workforce could not be loaded.':'Staffing changed.'} Your reviewed reassignment remains held. Reload workforce must successfully read current staffing before reviewing and confirming again.</p>:gate.command&&!gate.pending?<p role="status">The response is uncertain. Retry the unchanged reassignment; its original input and key are retained.</p>:null}
 {error?<ErrorBanner message={error}/>:null}
 <div className="row"><Button disabled={busy||gate.stale||!target||!snapshot||!confirmed||closed||!!moving.partyChiefId&&!currentChief} onClick={()=>void save()}>{busy?'Saving…':gate.command&&!gate.stale?'Retry unchanged reassignment':'Confirm crew reassignment'}</Button><Button variant="secondary" disabled={busy||gate.pending||!!gate.command&&!gate.stale} onClick={()=>void reload()}>Reload workforce</Button></div></div>:<>
 <form className="tm-search" onSubmit={e=>{e.preventDefault();setSearch(draft.trim());setOffset(0);}}>
 <label className="field tm-search-text"><span className="field-label">Search assigned personnel</span><input className="input" value={draft} maxLength={120} onChange={e=>setDraft(e.target.value)}/></label>
 <label className="field"><span className="field-label">Items per page</span><select className="select" value={limit} onChange={e=>{setLimit(Number(e.target.value));setOffset(0);}}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select></label><Button type="submit" variant="secondary">Search</Button></form>
 {page.error?<><ErrorBanner message={page.error}/><Button variant="secondary" onClick={()=>void reload()}>Retry workforce</Button></>:!page.data?<p role="status">Loading assigned personnel…</p>:<>
 {page.data.total===0?<p>No team members match. Try another search, or ask your Survey Manager to check your team roster.</p>:null}
 <RecordCollection label="assigned personnel" records={<>{page.data.data.map(person=><li className="tm-person" key={person.userId}><div><strong>{person.name}</strong><span className="tm-email muted">{person.email}</span></div><div>{person.role==='PARTY_CHIEF'?'Party Chief':'Instrument Man'}</div><div className="tm-person-actions"><MemberKpiEntry projectId={projectId} person={person} role={role}/>{superintendent&&!closed&&person.role==='INSTRUMENT_MAN'?<Button variant="secondary" aria-label={`Reassign ${person.name}`} onClick={()=>openMove(person,page.data!.snapshotToken)}>Reassign crew</Button>:null}</div></li>)}</>}/>
 <PaginationControls total={page.data.total} offset={offset} limit={limit} onChange={setOffset}/></>}
 </>}
 </section>;
}
