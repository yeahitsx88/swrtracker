'use client';
import {useEffect,useRef,useState} from 'react';
import {apiClient,apiRequest} from '@/lib/apiClient';
import {CommandOwner} from '@/lib/frozen-command';
import {operationsStatusLabel} from '@/lib/operations-view';
import {getErrorMessage} from '@/lib/errors';
import type {TicketRecord} from '@/lib/contracts';
import {Button,ErrorBanner} from '@/components/ui';
import {AdministrationDialog} from './administration-dialog';
import {useTeamCommand} from './team-management';
import type {AssignmentChoice} from '@/modules/ticket/application/assignment-choices';
export function CrewAssignment({ticket,onSaved,fixedChiefId,allowChiefOnly=false,disabled=false,owner,restrictToSelectedTeam=false}:{ticket:TicketRecord;onSaved:()=>void;fixedChiefId?:string;allowChiefOnly?:boolean;disabled?:boolean;owner?:CommandOwner;restrictToSelectedTeam?:boolean}){
 const local=useRef(new CommandOwner()),shared=owner??local.current,token='crew:'+ticket.id;
 const [open,setOpen]=useState(false);
 const close=()=>{shared.release(token);setOpen(false);};
 return <><Button variant="secondary" disabled={disabled} onClick={()=>{if(!disabled&&shared.claim(token))setOpen(true);}}>Choose a Crew</Button>{open?<CrewDialog ticket={ticket} fixedChiefId={fixedChiefId} allowChiefOnly={allowChiefOnly} restrictToSelectedTeam={restrictToSelectedTeam} close={close} saved={()=>{close();onSaved();}}/>:null}</>;
}
function CrewDialog({ticket,close,saved,fixedChiefId,allowChiefOnly,restrictToSelectedTeam}:{ticket:TicketRecord;close:()=>void;saved:()=>void;fixedChiefId?:string;allowChiefOnly:boolean;restrictToSelectedTeam:boolean}){
 const ticketId=ticket.id,command=useTeamCommand(),[people,setPeople]=useState<AssignmentChoice[]>(),[error,setError]=useState<string|null>(null),[reloading,setReloading]=useState(false);
 const [chief,setChief]=useState(fixedChiefId??ticket.assignedPartyChiefId??''),[instrument,setInstrument]=useState(ticket.assignedInstrumentManId??''),[confirmed,setConfirmed]=useState(false);
 useEffect(()=>{let active=true;apiRequest<{people:AssignmentChoice[]}>('/api/tickets/'+ticketId+'/assign').then(data=>{if(active)setPeople(data.people);}).catch(err=>{if(active)setError(getErrorMessage(err,'Unable to load crew choices. Close this dialog and try again.'));});return()=>{active=false;};},[ticketId]);
 const selectedTeam=people?.find(person=>person.id===chief)?.teamId;
 const instruments=people?.filter(person=>person.role==='INSTRUMENT_MAN'&&(!restrictToSelectedTeam||!selectedTeam||person.teamId===selectedTeam));
 const chiefValid=!chief||!!people?.some(person=>person.id===chief&&person.role==='PARTY_CHIEF');
 const instrumentValid=!!instrument&&!!instruments?.some(person=>person.id===instrument);
 const canAssign=chiefValid&&(instrumentValid||(!instrument&&allowChiefOnly&&!!chief));
 async function reload(){if(reloading||!command.stale)return;setReloading(true);setError(null);try{await Promise.all([apiClient.getTicket(ticketId),apiRequest('/api/tickets/'+ticketId+'/assign')]);if(command.reset()){setConfirmed(false);saved();}}catch(err){setError(getErrorMessage(err,'Unable to reload this request and its crew choices. Try again before making another assignment.'));}finally{setReloading(false);}}
 return <AdministrationDialog title="Choose a Crew" locked={command.locked||reloading} onDismiss={close}><form className="stack" onSubmit={event=>{event.preventDefault();if(!confirmed||!canAssign||reloading)return;void command.run('assign',{ticketId,chief,instrument},key=>apiRequest('/api/tickets/'+ticketId+'/assign',{method:'POST',body:{assignedPartyChiefId:chief||null,assignedInstrumentManId:instrument||null},headers:{'Idempotency-Key':key}}),saved);}}>
 <p><strong>{ticket.ticketNumber??'Request'}</strong> · {operationsStatusLabel(ticket.status)}</p>
 <p>{allowChiefOnly?'Choose a Party Chief to arrange the crew, or select an Instrument Man now.':'Choose an Instrument Man for this request.'} Selecting an Instrument Man makes the request ready for field work. Existing assignment history is retained.</p>
 {error?<ErrorBanner message={error}/>:null}{!people&&!error?<p role="status">Loading your crew choices…</p>:people?<>
 <label className="field"><span className="field-label">Party Chief</span><select className="select" aria-label="Party Chief" value={chief} disabled={command.locked||!!fixedChiefId||reloading} onChange={event=>{setChief(event.target.value);setInstrument('');setConfirmed(false);}}>{!fixedChiefId?<option value="">No Party Chief</option>:null}{chief&&!chiefValid?<option value={chief} disabled>Current Party Chief is unavailable</option>:null}{people.filter(person=>person.role==='PARTY_CHIEF').map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
 <label className="field"><span className="field-label">Instrument Man</span><select className="select" aria-label="Instrument Man" value={instrument} disabled={command.locked||reloading} onChange={event=>{setInstrument(event.target.value);setConfirmed(false);}}><option value="">{allowChiefOnly?'Let the Party Chief choose':'Choose an Instrument Man'}</option>{instrument&&!instrumentValid?<option value={instrument} disabled>Current Instrument Man is unavailable</option>:null}{instruments?.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
 {allowChiefOnly&&chief&&!instrument?<p role="status">The request will wait for the Party Chief to choose an Instrument Man.</p>:null}
 {!people.length?<p>No eligible surveyors are available for this request. Ask the Survey Manager to check the team and Area assignments.</p>:null}
 </>:null}
 {!chiefValid||instrument&&!instrumentValid?<p role="status">The current crew selection is unavailable. Choose eligible survey personnel or ask the Survey Manager to resolve it.</p>:null}
 <p>Next responsible person: {instrumentValid?instruments?.find(person=>person.id===instrument)?.name:chiefValid&&chief?people?.find(person=>person.id===chief)?.name:'Choose a Crew to see who continues the work'}.</p>
 <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={command.locked||reloading} onChange={event=>setConfirmed(event.target.checked)}/><span>I confirm this crew assignment for {ticket.ticketNumber??'this request'}.</span></label>
 {command.error?<ErrorBanner message={command.error}/>:null}{command.uncertain&&!command.busy?<p role="status">The result is uncertain. Retry this unchanged crew assignment to recover its recorded result.</p>:null}{command.stale?<p role="status">Reload the current request and crew choices, then review and confirm again.</p>:null}
 <div className="row"><Button type="submit" disabled={!confirmed||!canAssign||!people||!!error||command.busy||command.stale||reloading}>{command.busy?'Saving…':command.uncertain?'Retry unchanged crew':'Confirm crew assignment'}</Button>{command.stale?<Button type="button" variant="secondary" disabled={reloading} onClick={()=>void reload()}>{reloading?'Reloading…':'Reload crew choices'}</Button>:null}</div>
 </form></AdministrationDialog>;
}
