'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {apiClient} from '@/lib/apiClient';
import {Button} from '@/components/ui';

/** An empty search checks the project, rather than the current filtered team page. */
export function SurveySetupTip({projectId}:{projectId:string}){
 const [empty,setEmpty]=useState(false),[dismissed,setDismissed]=useState(false);
 useEffect(()=>{let active=true;setEmpty(false);setDismissed(false);
  apiClient.listSurveyTeams(projectId,{search:'',limit:10,offset:0}).then(result=>{if(active)setEmpty(result.total===0);}).catch(()=>{/* A failed read must not claim the project has no teams. */});
  return()=>{active=false;};
 },[projectId]);
 if(!empty||dismissed)return null;
 return <aside className="panel stack" aria-label="Survey team setup reminder">
  <h2 className="panel-title">Build your first survey team</h2>
  <p>Choose a lead, add surveyors and select the Areas they cover. The team will receive alerts when requests arrive for those Areas.</p>
  <div className="row"><Link className="button" href={`/projects/${projectId}/survey/teams#survey-setup`}>Set up your team</Link><Button variant="secondary" onClick={()=>setDismissed(true)}>Not now</Button></div>
 </aside>;
}

export function SurveySetupGuide({disabled,onSelect}:{disabled:boolean;onSelect:(tab:'areas'|'teams'|'personnel')=>void}){
 const [open,setOpen]=useState(false);
 useEffect(()=>{if(window.location.hash==='#survey-setup')setOpen(true);},[]);
 return <details id="survey-setup" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>Survey setup guide</summary>
  <div className="stack">
   <p>Start with the places that need survey support, then choose the people responsible for them.</p>
   <ol>
    <li><strong>Create Areas.</strong> Requesters select these locations when asking for support.</li>
    <li><strong>Create a team.</strong> Choose its members, a team lead and every Area it covers. Teams may share Areas.</li>
    <li><strong>Arrange the crew.</strong> Assign Instrument Men to Party Chiefs. Superintendents can organize their own teams; only you can move people between teams.</li>
   </ol>
   <p>When a request arrives, you and the team covering its Area are alerted. You can assign work to a team or directly to a surveyor.</p>
   <div className="row"><Button variant="secondary" disabled={disabled} onClick={()=>onSelect('areas')}>Open Areas</Button><Button variant="secondary" disabled={disabled} onClick={()=>onSelect('teams')}>Open teams</Button><Button variant="secondary" disabled={disabled} onClick={()=>onSelect('personnel')}>Open survey personnel</Button></div>
  </div>
 </details>;
}
