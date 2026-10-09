'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Button} from '../button';
import {Icon} from '../icon';
import {CommandOwner} from '@/lib/frozen-command';
import {useAdministrationProgress} from '@/lib/use-administration-progress';
import {SurveyOrgChartWorkspace} from './survey-org-chart-workspace';
import {LiveSurveyOrgChart} from './live-survey-org-chart';
import './survey-org-chart-overlay.css';
type EditorRole='SURVEY_MANAGER'|'SURVEY_SUPERINTENDENT';
function SurveyOrgChartOverlay({projectId,editorRole,readOnly,owner,onDismiss,onCommitted}:{projectId?:string;editorRole?:EditorRole;readOnly:boolean;owner:CommandOwner;onDismiss:()=>void;onCommitted:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),heading=useId(),held=useRef(false),[reviewing,setReviewing]=useState(false);
  useEffect(()=>{const node=dialog.current,trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;node?.showModal();return()=>{node?.close();if(trigger?.isConnected)trigger.focus({preventScroll:true});};},[]);
  const dismiss=()=>{if(!held.current)onDismiss();};
  return <dialog ref={dialog} className="survey-org-chart-overlay" aria-labelledby={heading} onCancel={event=>{if(event.target!==event.currentTarget)return;event.preventDefault();dismiss();}}>
    <div className="survey-org-chart-overlay-heading"><h2 id={heading} tabIndex={-1} autoFocus>Survey Organization Chart · {editorRole&&!readOnly?'Visual Editor':projectId?'Read-Only':'Demo'}</h2><Button variant="secondary" className="icon-close" aria-label="Close organization chart" disabled={reviewing} onClick={dismiss}><Icon name="close"/></Button></div>
    <div className="survey-org-chart-overlay-body">{projectId?<LiveSurveyOrgChart projectId={projectId} editorRole={editorRole} owner={owner} onReviewChange={open=>{held.current=open;setReviewing(open);}} onCommitted={onCommitted}/>:<SurveyOrgChartWorkspace/>}</div>
  </dialog>;
}
/** Conventional editors and the visual workspace share one command owner. */
export function SurveyOrgChartLauncher({projectId,disabled=false,editorRole,readOnly=false,owner:workspaceOwner,onChanged}:{projectId?:string;disabled?:boolean;editorRole?:EditorRole;readOnly?:boolean;owner?:CommandOwner;onChanged?:()=>void}) {
  const localOwner=useRef(new CommandOwner()).current,owner=workspaceOwner??localOwner,changed=useRef(false),[open,setOpen]=useState(false);
  useAdministrationProgress(owner,`/projects/${projectId}/survey/teams`);
  const launch=()=>{if(disabled||!owner.claim('visual'))return;changed.current=false;setOpen(true);};
  const dismiss=()=>{setOpen(false);owner.release('visual');if(changed.current)onChanged?.();};
  return <><Button variant="secondary" disabled={disabled} onClick={launch}>{editorRole&&!readOnly?'Open Visual Editor':`Open Survey Organization Chart (${projectId?'Read-Only':'Demo'})`}</Button>{open&&<SurveyOrgChartOverlay projectId={projectId} editorRole={editorRole} readOnly={readOnly} owner={owner} onDismiss={dismiss} onCommitted={()=>{changed.current=true;}}/>}</>;
}
