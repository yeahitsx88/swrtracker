'use client';
import dynamic from 'next/dynamic';
import {useRef,useState} from 'react';
import {Button} from './button';
import type {WorkforcePerson} from '@/modules/tenancy/application/survey-workforce';
import type {ProjectRole} from '@/modules/identity/domain/types';
import {memberMetricFocus} from '@/modules/reporting/application/member-metrics';
import './scoped-kpi-entry.css';
import './popout.css';
import {closePopup} from './popup-motion';
const KpiExplorer=dynamic(()=>import('./kpi-explorer').then(m=>m.KpiExplorer),{loading:()=> <p role="status">Loading member KPIs…</p>});
export function MemberKpiEntry({projectId,person,role}:{projectId:string;person:WorkforcePerson;role:ProjectRole}){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const [opened,setOpened]=useState(false);
 const cohort=role==='SURVEY_SUPERINTENDENT'||person.role==='SURVEY_SUPERINTENDENT'?'linkedCrews' as const:undefined;
 const focus={...memberMetricFocus(person,role,{}),...(cohort?{cohort}:{})};
 return <><Button ref={trigger} variant="secondary" onClick={()=>{setOpened(true);dialog.current?.showModal();}} aria-label={`KPIs for ${person.name}`}>View KPIs</Button>
 <dialog onCancel={event=>{event.preventDefault();closePopup(dialog.current);}} ref={dialog} className="kpi-entry-dialog popout-dialog" aria-label={`KPIs for ${person.name}`} onClose={()=>{setOpened(false);trigger.current?.focus({preventScroll:true});}}>
 <div className="popout-header"><h2>{person.name} · KPIs</h2><Button variant="secondary" onClick={()=>closePopup(dialog.current)}>Close</Button></div>
 <div className="popout-body">{opened?<KpiExplorer key={person.userId} projectId={projectId} memberId={person.userId} fixedFilters={focus} initialMeasure="all" audience={role==='SURVEY_MANAGER'?'operations':'field'}/>:null}</div>
 </dialog></>;
}
