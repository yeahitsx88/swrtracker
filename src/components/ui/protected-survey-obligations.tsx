'use client';
import {HeadingHelp} from '@/components/ui/heading-help';

import {RecordCollection} from '@/components/ui/record-collection';
import {useEffect,useReducer,useRef,useState,useSyncExternalStore,type FormEvent} from 'react';
import type {UUID,Page} from '@/shared/types';
import type {ProtectedPerson,ProtectedReadQuery,ResolveReviewerResult,CoverageIntent} from '@/modules/tenancy/application/protected-obligations.types';
import {apiClient,createIdempotencyKey} from '@/lib/apiClient';
import {CommandOwner} from '@/lib/frozen-command';
import {getErrorMessage} from '@/lib/errors';
import {initialProtectedEditor,reduceProtectedEditor,canConfirmProtectedResolution,coveragePreview,protectedResolutionFailure} from '@/lib/protected-obligations-view';
import {Button,ErrorBanner,SuccessBanner} from '@/components/ui';
import {AdministrationSection,AdministrationRecords} from './administration-records';
import {roleLabel} from '@/lib/display-labels';
import {PaginationControls} from '@/components/forms';
import './team-management.css';

export function ProtectedSurveyObligations({projectId,userId,onResolved,onLockChange,disabled=false,isBlocked,invalidateVersion=0,owner:providedOwner}:{projectId:string;userId?:UUID;onResolved?:(result:ResolveReviewerResult)=>void;onLockChange?:(locked:boolean)=>void;disabled?:boolean;isBlocked?:()=>boolean;invalidateVersion?:number;owner?:CommandOwner}){
 const localOwner=useRef(new CommandOwner()).current,owner=providedOwner??localOwner,token=`protected-reviewer:${projectId}:${userId??'project'}`;
 useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const blocked=owner.blocked(token);
 const [state,dispatch]=useReducer(reduceProtectedEditor,undefined,initialProtectedEditor);
 const [open,setOpen]=useState(!!userId),[people,setPeople]=useState<Page<ProtectedPerson>|null>(null);
 const [personType,setPersonType]=useState('');
 const [draft,setDraft]=useState(''),[search,setSearch]=useState(''),[limit,setLimit]=useState<10|25|50|100>(10),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
 const [success,setSuccess]=useState<string|null>(null),heading=useRef<HTMLHeadingElement>(null),running=useRef(false),generation=useRef(0),seenInvalidation=useRef(invalidateVersion);
 const frozen=state.pending||state.uncertain||disabled||blocked;
 useEffect(()=>{if(userId)dispatch({type:'person',userId});},[userId]);
 useEffect(()=>{if(seenInvalidation.current!==invalidateVersion){seenInvalidation.current=invalidateVersion;dispatch({type:'stale',message:'Related staffing changed. Reload current obligations before confirming.'});setSuccess(null);}},[invalidateVersion]);
 useEffect(()=>{
  if(!open||frozen)return;
  let active=true;const current=Math.max(generation.current,state.generation)+1;generation.current=current;
  dispatch({type:'load',generation:current});
  const query={search,limit,offset};
  const input:ProtectedReadQuery=state.userId?(state.grant?{mode:'candidates',userId:state.userId,grantId:state.grant.grantId,query}:{mode:'obligations',userId:state.userId,query}):{mode:'personnel',query};
  async function read(){if(input.mode!=='personnel')return apiClient.readProtectedObligations(projectId,input);const all:ProtectedPerson[]=[];for(let page=0;page<1000;page++){const data=await apiClient.readProtectedObligations(projectId,{mode:'personnel',query:{search:'',limit:100,offset:page*100}});if(data.mode!=='personnel')throw new Error('Unexpected personnel response');all.push(...data.personnel.data);if(all.length>=data.personnel.total)return {...data,personnel:{data:all,total:all.length,limit:all.length,offset:0}};}throw new Error('Personnel inventory exceeded the available page limit');}
  read().then(data=>{
   if(!active)return;
   if(data.mode==='personnel'){setPeople(data.personnel);dispatch({type:'readFailure',generation:current,message:''});}
   else if(data.mode==='obligations')dispatch({type:'obligations',generation:current,data});
   else dispatch({type:'candidates',generation:current,data});
  }).catch(error=>{if(active)dispatch({type:'readFailure',generation:current,message:getErrorMessage(error,'Unable to read protected obligations. Retry the read.')});});
  return()=>{active=false;};
 // Generation changes deliberately do not initiate reads. Selection/query/reload do.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[projectId,open,state.userId,state.grant?.grantId,search,limit,offset,revision,frozen]);
 const resetQuery=()=>{setDraft('');setSearch('');setOffset(0);};
 function reload(){if(frozen||isBlocked?.())return;owner.release(token);onLockChange?.(false);dispatch({type:'reload'});resetQuery();setRevision(n=>n+1);setSuccess(null);heading.current?.focus();}
 function cancel(){if(frozen||isBlocked?.())return;dispatch({type:'cancel'});resetQuery();heading.current?.focus();}
 async function submit(event:FormEvent){
  event.preventDefault();if(running.current||disabled||blocked||isBlocked?.())return;
  const next=reduceProtectedEditor(state,state.uncertain?{type:'retry'}:{type:'begin',key:createIdempotencyKey()});
  if(!next.pending||!next.attempt||!owner.claim(token))return;running.current=true;onLockChange?.(true);let retainLock=false;
  dispatch(state.uncertain?{type:'retry'}:{type:'begin',key:next.attempt.key});
  try{
   const result=await apiClient.resolveSurveyReviewer(projectId,next.attempt.input,next.attempt.key);
   dispatch({type:'success',result});dispatch({type:'reload'});resetQuery();setRevision(n=>n+1);
   setSuccess('One Survey Reviewer grant handed over. Remaining Area, reporting, crew and team obligations still need separate resolution before a role change.');
   onResolved?.(result);heading.current?.focus();
  }catch(error){
   const failure=protectedResolutionFailure(error);retainLock=failure.type==='uncertain'||failure.type==='stale';dispatch(failure);
  }finally{running.current=false;if(!retainLock)owner.release(token);onLockChange?.(retainLock);}
 }
 const page=state.userId?(state.grant?state.candidates?.candidates:state.detail?.obligations):people;
 const label=state.userId?(state.grant?'Search replacement Superintendents':'Search obligations by Area or responsibility'):'Search project personnel';
 const preview=state.candidate?coveragePreview(state.candidate):null;
 return <section className="tm-section stack tm-workspace" aria-label="Protected Survey Reviewer obligations">
  <AdministrationSection title="Area Review Responsibilities" open={!!userId} locked={frozen}>
  <HeadingHelp label={"Survey Reviewer Coverage"} heading={<h4 tabIndex={-1} ref={heading}>Survey Reviewer Coverage</h4>} help={<span>Hand over one live Area review grant to another current Superintendent. Role changes and remaining staffing are separate.</span>}/>
  {!open?<Button type="button" variant="secondary" disabled={frozen} onClick={()=>setOpen(true)}>Inspect Area Review Responsibilities</Button>:<>
   {success?<SuccessBanner message={success}/>:null}
   {state.stale?<ErrorBanner message="Protected obligations changed. Reload current obligations before confirming; cancelling does not clear this warning."/>:null}
   {state.error?<ErrorBanner message={state.error}/>:null}
   {state.loading?<p role="status" className="muted">Loading protected obligations...</p>:null}
   {state.detail?<p>Selected person: <strong>{state.detail.person.name}</strong> · {state.detail.person.role.replaceAll('_',' ')}{!state.detail.person.active?' · Inactive':''}</p>:null}
   {state.detail?.project.status==='ARCHIVED'?<p className="muted">Closed project - evidence is read only.</p>:null}
   {!state.grant&&state.detail?<p className="muted">Current protected evidence: {state.detail.person.responsibilityCount} responsibility grants, {state.detail.actingCount} acting grants, {state.detail.departmentMembershipCount} department memberships. Other Area, crew, reporting and team blockers are checked separately by the role command.</p>:null}
   {!state.grant&&state.detail&&(state.detail.actingCount>0||state.detail.departmentMembershipCount>0)?<p className="muted">Acting and department resolution require an approved IT contract; these controls cannot resolve them.</p>:null}
   {state.userId&&<form className="tm-search" onSubmit={e=>{e.preventDefault();if(!frozen){setSearch(draft.trim());setOffset(0);setRevision(n=>n+1);}}}>
    <label className="field tm-search-text"><span className="field-label">{label}</span><input className="input" maxLength={200} value={draft} disabled={frozen} onChange={e=>setDraft(e.target.value)}/></label>
    <label className="field"><span className="field-label">Obligation items per page</span><select className="select" value={limit} disabled={frozen} onChange={e=>{setLimit(Number(e.target.value) as typeof limit);setOffset(0);}}>{[10,25,50,100].map(n=><option value={n} key={n}>{n}</option>)}</select></label>
    <Button type="submit" variant="secondary" disabled={frozen}>Search</Button>
   </form>}
   {!state.loading&&page?.total===0?<p className="tm-empty">{state.grant?'No eligible Superintendents match. IT manages project membership and roles.':state.userId?'No current responsibility grants match. Other staffing obligations may remain.':'No project personnel match.'}</p>:null}
   {!state.userId?<><label className="field"><span className="field-label">Person type</span><select className="select" value={personType} disabled={frozen||state.loading} onChange={e=>setPersonType(e.target.value)}><option value="">All person types</option>{[...new Set(people?.data.map(p=>p.role)??[])].sort().map(role=><option key={role} value={role}>{roleLabel(role)}</option>)}</select></label><AdministrationRecords label="project personnel" rows={(people?.data??[]).filter(p=>!personType||p.role===personType)} id={p=>p.userId} disabled={frozen||state.loading} columns={[{key:'name',label:'Name',text:p=>p.name},{key:'email',label:'Email',text:p=>p.email},{key:'role',label:'Person type',text:p=>roleLabel(p.role)},{key:'active',label:'Access',text:p=>p.active?'Active':'Inactive'},{key:'grants',label:'Responsibility grants',text:p=>String(p.responsibilityCount)}]} actions={person=><Button type="button" variant="secondary" disabled={frozen||state.loading} aria-label={`Inspect obligations for ${person.name}`} onClick={()=>{dispatch({type:'person',userId:person.userId});resetQuery();setSuccess(null);heading.current?.focus();}}>Inspect</Button>}/></>:!state.grant?<RecordCollection label="Area review obligations" records={<>{state.detail?.obligations.data.map(grant=><li className="tm-person" key={grant.grantId}><div><strong>{grant.areaName??'No Area scope'}</strong><span className="tm-email muted">{grant.responsibility.replaceAll('_',' ')}</span></div><div>{grant.addedCoverageIntent?<span className="tm-email">Added review grant: {grant.addedCoverageIntent==='TEMPORARY'?'temporary until confirmed handover':'permanent'}</span>:null}{grant.addedIndividualAssignment?<span className="tm-email">Added individual Area assignment: {grant.addedIndividualAssignment.coverageIntent==='TEMPORARY'?'temporary until confirmed handover':'permanent'}</span>:null}{grant.unsupportedReason?<span className="muted">{grant.unsupportedReason}. Further IT contract required.</span>:null}</div>{grant.canResolve&&state.detail?.project.status!=='ARCHIVED'?<Button type="button" variant="secondary" aria-label={`Hand over ${grant.areaName} review grant`} disabled={frozen||state.loading||state.stale||!!state.error} onClick={()=>{dispatch({type:'grant',grant});resetQuery();setSuccess(null);heading.current?.focus();}}>Hand over</Button>:null}</li>)}</>}/>:<>
    <h4>Hand Over {state.grant.areaName} Review Grant</h4>
    <p>Departing reviewer: <strong>{state.detail?.person.name}</strong>. Choose a different Superintendent for this exact Area.</p>
    <RecordCollection label="covered replacement candidates" records={<>{state.candidates?.candidates.data.map(candidate=><li className="tm-person" key={candidate.userId}><div><strong>{candidate.name}</strong><span className="tm-email muted">{candidate.email}</span></div><div>{candidate.canReuse?'Complete existing Area coverage':'Additional Area coverage required'}</div><Button type="button" variant="secondary" aria-label={`Select replacement ${candidate.name}`} aria-pressed={state.candidate?.userId===candidate.userId} disabled={frozen||state.loading||state.stale||!!state.error} onClick={()=>dispatch({type:'candidate',candidate})}>{state.candidate?.userId===candidate.userId?'Selected':'Select'}</Button></li>)}</>}/>
    {state.candidate&&preview?<form className="stack" onSubmit={submit} aria-label="Confirm Survey Reviewer handover">
     <p>Replacement: <strong>{state.candidate.name}</strong> · Area: <strong>{state.grant.areaName}</strong></p>
     <ul><li>{preview.review}</li><li>{preview.individual}</li><li>Keep the replacement's other Areas and existing coverage provenance.</li><li>Resolve only this departing review grant. Individual Area, reporting, crew and role obligations remain.</li></ul>
     {state.mode==='assignAdditional'?<>
      <label className="field"><span className="field-label">Additional coverage intent</span><select className="select" disabled={frozen} value={state.intent??''} onChange={e=>dispatch({type:'intent',intent:(e.target.value||null) as CoverageIntent|null})}><option value="">Choose intent...</option><option value="TEMPORARY">Temporary until confirmed handover</option><option value="PERMANENT">Permanent coverage</option></select></label>
      {state.intent==='TEMPORARY'?<p className="muted">Temporary coverage continues until a confirmed manual handover. It does not expire automatically.</p>:null}
      <label className="tm-check"><input type="checkbox" checked={state.additionalConfirmed} disabled={frozen} onChange={e=>dispatch({type:'additional',confirmed:e.target.checked})}/><span>I confirm adding the missing {state.grant.areaName} coverage to {state.candidate.name} with the selected intent.</span></label>
     </>:<p className="muted">Reuse complete existing coverage. No coverage row or intent label will be added.</p>}
     <label className="tm-check"><input type="checkbox" checked={state.confirmed} disabled={frozen} onChange={e=>dispatch({type:'confirm',confirmed:e.target.checked})}/><span>I confirm handing over {state.detail?.person.name}'s {state.grant.areaName} review grant to {state.candidate.name}.</span></label>
     <div className="row"><Button type="submit" disabled={disabled||blocked||state.pending||(!state.uncertain&&!canConfirmProtectedResolution(state))}>{state.pending?'Handing over...':state.uncertain?'Retry unchanged handover':'Confirm handover'}</Button><Button type="button" variant="secondary" disabled={frozen} onClick={cancel}>Keep current grant</Button></div>
    </form>:<Button type="button" variant="secondary" disabled={frozen} onClick={cancel}>Keep current grant</Button>}
   </>}
   {state.userId&&page&&page.total>0?<div className="tm-footer"><span className="muted" role="status">{page.total} results</span>{!frozen?<PaginationControls total={page.total} limit={limit} offset={offset} onChange={next=>{if(!frozen)setOffset(next);}}/>:null}</div>:null}
   <div className="row"><Button type="button" variant="secondary" disabled={frozen} onClick={reload}>Reload current obligations</Button>{!userId&&state.userId?<Button type="button" variant="secondary" disabled={frozen} onClick={()=>{dispatch({type:'reload'});dispatch({type:'person',userId:null});resetQuery();setSuccess(null);}}>Back to project personnel</Button>:null}</div>
  </>}
  </AdministrationSection>
 </section>;
}
