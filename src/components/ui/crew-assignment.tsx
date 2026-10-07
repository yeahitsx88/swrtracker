'use client';
import {useEffect,useState} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {Button,ErrorBanner} from '@/components/ui';
import {AdministrationDialog} from './administration-dialog';
import {useTeamCommand} from './team-management';
import type {AssignmentChoice} from '@/modules/ticket/application/assignment-choices';
export function CrewAssignment({ticketId,onSaved,fixedChiefId,allowChiefOnly=false,disabled=false}:{ticketId:string;onSaved:()=>void;fixedChiefId?:string;allowChiefOnly?:boolean;disabled?:boolean}){
 const [open,setOpen]=useState(false);
 return <><Button variant="secondary" disabled={disabled} onClick={()=>{if(!disabled)setOpen(true);}}>Choose a crew</Button>{open?<CrewDialog ticketId={ticketId} fixedChiefId={fixedChiefId} allowChiefOnly={allowChiefOnly} close={()=>setOpen(false)} saved={()=>{setOpen(false);onSaved();}}/>:null}</>;
}
function CrewDialog({ticketId,close,saved,fixedChiefId,allowChiefOnly}:{ticketId:string;close:()=>void;saved:()=>void;fixedChiefId?:string;allowChiefOnly:boolean}){
 const command=useTeamCommand(),[people,setPeople]=useState<AssignmentChoice[]>(),[error,setError]=useState(false);
 const [chief,setChief]=useState(fixedChiefId??''),[instrument,setInstrument]=useState(''),[confirmed,setConfirmed]=useState(false);
 useEffect(()=>{let active=true;apiRequest<{people:AssignmentChoice[]}>('/api/tickets/'+ticketId+'/assign').then(data=>{if(active)setPeople(data.people);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[ticketId]);
 const selectedTeam=people?.find(person=>person.id===chief)?.teamId;
 const instruments=people?.filter(person=>person.role==='INSTRUMENT_MAN'&&(!selectedTeam||person.teamId===selectedTeam));
 const canAssign=!!instrument||(allowChiefOnly&&!!chief);
 return <AdministrationDialog title="Choose a crew" locked={command.locked} onDismiss={close}><form className="stack" onSubmit={event=>{event.preventDefault();if(!confirmed||!canAssign)return;void command.run('assign',{ticketId,chief,instrument},key=>apiRequest('/api/tickets/'+ticketId+'/assign',{method:'POST',body:{assignedPartyChiefId:chief||null,assignedInstrumentManId:instrument||null},headers:{'Idempotency-Key':key}}),saved);}}>
 <p>{allowChiefOnly?'Choose a Party Chief to arrange the crew, or select an Instrument Man now.':'Choose an Instrument Man for this request.'} Selecting an Instrument Man makes the request ready for field work.</p>
 {error?<ErrorBanner message="Unable to load crew choices. Close this dialog and try again."/>:!people?<p role="status">Loading your crew choices…</p>:<>
 <label className="field"><span className="field-label">Party Chief</span><select className="select" aria-label="Party Chief" value={chief} disabled={command.locked||!!fixedChiefId} onChange={event=>{setChief(event.target.value);setInstrument('');setConfirmed(false);}}>{!fixedChiefId?<option value="">No Party Chief</option>:null}{people.filter(person=>person.role==='PARTY_CHIEF').map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
 <label className="field"><span className="field-label">Instrument Man</span><select className="select" aria-label="Instrument Man" value={instrument} disabled={command.locked} onChange={event=>{setInstrument(event.target.value);setConfirmed(false);}}><option value="">{allowChiefOnly?'Let the Party Chief choose':'Choose an Instrument Man'}</option>{instruments?.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
 {allowChiefOnly&&chief&&!instrument?<p role="status">The request will wait for the Party Chief to choose an Instrument Man.</p>:null}
 {!people.length?<p>No eligible surveyors are available for this request. Ask the Survey Manager to check the team and Area assignments.</p>:null}
 </>}
 <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={command.locked} onChange={event=>setConfirmed(event.target.checked)}/><span>I confirm this crew assignment.</span></label>
 {command.error?<ErrorBanner message={command.error}/>:null}<div className="row"><Button type="submit" disabled={!confirmed||!canAssign||command.busy||command.stale}>{command.busy?'Saving…':command.uncertain?'Retry unchanged crew':'Confirm crew assignment'}</Button>{command.stale?<Button type="button" variant="secondary" onClick={()=>{if(command.reset())saved();}}>Reload crew choices</Button>:null}</div>
 </form></AdministrationDialog>;
}
