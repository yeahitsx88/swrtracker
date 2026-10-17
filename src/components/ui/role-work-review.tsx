'use client';
import {useEffect,useState} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import {operationsStatusLabel} from '@/lib/operations-view';
import type {PlannedWorkItem,WorkDecision,WorkPart} from '@/modules/tenancy/domain/promotion-work';
import type {SurveyRoleObligations} from '@/modules/tenancy/application/change-survey-role';
import {ErrorBanner} from './feedback';

interface Person {id:string;name:string}
export interface RoleWork {items:PlannedWorkItem[];candidates:{partyChiefs:Person[];instrumentMen:Person[]};blockers:SurveyRoleObligations}
type Choice={action:'KEEP'|'REASSIGN'|'';replacementId:string};
const key=(item:{ticketId:string;part:WorkPart})=>`${item.ticketId}:${item.part}`;
const PART:Record<WorkPart,string>={CHIEF:'Party Chief',INSTRUMENT:'Instrument Man',REVIEWER:'Field-report reviewer'};

/** Structural duties still resolved in Team Management before any role change. */
export function roleWorkBlockers(blockers:SurveyRoleObligations):string[]{
 return [
  blockers.leadsTeam&&'leads a named team',
  blockers.crewLinks&&`${blockers.crewLinks} crew link(s)`,
  blockers.reportingLinks&&`${blockers.reportingLinks} reporting link(s)`,
  blockers.areaAssignments&&`${blockers.areaAssignments} Area assignment(s)`,
  blockers.responsibilityGrants&&`${blockers.responsibilityGrants} responsibility grant(s)`,
  blockers.actingGrants&&`${blockers.actingGrants} acting grant(s)`,
  blockers.pendingDelegations&&`${blockers.pendingDelegations} pending team delegation(s)`,
 ].filter((value):value is string=>!!value);
}

/**
 * Decision 57 / D8: the person's open requests for a role change, with one decision each —
 * keep (only where the new role can complete it) or reassign to someone in the old role.
 * Reports `decisions` (null until every item is decided) and the reasons the change can't proceed.
 */
export function RoleWorkReview({projectId,userId,role,disabled,onChange}:{projectId:string;userId:string;role:string;disabled:boolean;onChange:(state:{decisions:WorkDecision[]|null;problems:string[];loading:boolean})=>void}){
 const [work,setWork]=useState<RoleWork>(),[error,setError]=useState<string>(),[choices,setChoices]=useState<Record<string,Choice>>({});
 useEffect(()=>{let active=true;setWork(undefined);setError(undefined);setChoices({});
  apiRequest<RoleWork>(`/api/projects/${projectId}/survey/teams?mode=role-work&userId=${userId}&role=${role}`)
   .then(value=>{if(!active)return;setWork(value);setChoices(Object.fromEntries(value.items.map(item=>[key(item),{action:item.keepAllowed?'KEEP':item.reassignable?'REASSIGN':'',replacementId:''}])));})
   .catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to load this person’s open work. Reload personnel and try again.'));});
  return()=>{active=false;};},[projectId,userId,role]);
 useEffect(()=>{
  if(!work){onChange({decisions:null,problems:error?[error]:[],loading:!error});return;}
  const problems=[...roleWorkBlockers(work.blockers).map(text=>`Resolve first in Team Management: this person ${text}.`)];
  const decisions:WorkDecision[]=[];
  for(const item of work.items){
   const choice=choices[key(item)];
   if(!item.keepAllowed&&!item.reassignable){problems.push(`${item.ticketNumber??'A request'}: ${item.note}`);continue;}
   if(choice?.action==='KEEP'){decisions.push({ticketId:item.ticketId,part:item.part,action:'KEEP',expectedRowVersion:item.rowVersion});continue;}
   if(choice?.action==='REASSIGN'&&choice.replacementId){decisions.push({ticketId:item.ticketId,part:item.part,action:'REASSIGN',replacementId:choice.replacementId,expectedRowVersion:item.rowVersion});continue;}
   problems.push(`${item.ticketNumber??'A request'}: choose who takes over.`);
  }
  onChange({decisions:problems.length?null:decisions,problems,loading:false});
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[work,choices,error]);
 if(error)return <ErrorBanner message={error}/>;
 if(!work)return <p role="status">Checking this person’s open work…</p>;
 if(!work.items.length)return <p className="muted">This person has no open requests. Nothing moves with the role change.</p>;
 return <section className="stack role-work" aria-label="Open work for this role change">
  <h4>Open Work</h4>
  <p className="muted">Each open request needs a decision before the role changes. Reassigned requests use the normal assignment rules, and the crew is notified. Everything is applied together, or nothing is.</p>
  <ul className="role-work-list">{work.items.map(item=>{
   const choice=choices[key(item)],options=item.part==='CHIEF'?work.candidates.partyChiefs:work.candidates.instrumentMen;
   const set=(next:Partial<Choice>)=>setChoices(current=>({...current,[key(item)]:{...(current[key(item)]??{action:'',replacementId:''}),...next}}));
   return <li key={key(item)}>
    <div><strong>{item.ticketNumber??'Request'}</strong> · {item.description} <span className="muted">· {operationsStatusLabel(item.status)} · {PART[item.part]}</span></div>
    {item.keepAllowed?<label className="tm-check"><input type="radio" name={`work-${key(item)}`} checked={choice?.action==='KEEP'} disabled={disabled} onChange={()=>set({action:'KEEP'})}/><span>Keep with the new role</span></label>:null}
    {item.reassignable?<label className="field"><span className="field-label">{`New ${PART[item.part]} for ${item.ticketNumber??'this request'}`}</span>
     <select className="select" value={choice?.replacementId??''} disabled={disabled} onChange={event=>set({action:'REASSIGN',replacementId:event.target.value})}>
      <option value="">Choose who takes over</option>{options.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>:null}
    {!item.keepAllowed&&!item.reassignable?<p className="muted" role="note">{item.note}</p>:null}
   </li>;})}</ul>
 </section>;
}
