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
import type {DelegationTeam} from '@/modules/ticket/application/delegate-work';
interface Options {teams:DelegationTeam[];current:{teamId:string;teamName:string;leadName:string}|null}
export function TeamDelegation({ticket,canDelegate,onDelegated,disabled=false,owner}:{ticket:TicketRecord;canDelegate:boolean;onDelegated:()=>void;disabled?:boolean;owner?:CommandOwner}){
 const ticketId=ticket.id,local=useRef(new CommandOwner()),shared=owner??local.current,token='delegation:'+ticketId;
 const close=()=>{shared.release(token);setOpen(false);};
 const [data,setData]=useState<Options>(),[loadError,setLoadError]=useState(false),[revision,setRevision]=useState(0),[open,setOpen]=useState(false);
 useEffect(()=>{let active=true;setLoadError(false);apiRequest<Options>('/api/tickets/'+ticketId+'/delegate').then(value=>{if(active)setData(value);}).catch(()=>{if(active)setLoadError(true);});return()=>{active=false;};},[ticketId,revision]);
 return <div className="stack">{data?.current?<p role="status"><strong>Awaiting crew selection:</strong> {data.current.teamName} · {data.current.leadName}</p>:null}
 {loadError?<div><ErrorBanner message="Unable to load team assignment."/><Button variant="secondary" onClick={()=>setRevision(n=>n+1)}>Reload team assignment</Button></div>:null}
 {canDelegate?<div><Button variant="secondary" disabled={disabled||!data||loadError} onClick={()=>{if(!disabled&&shared.claim(token))setOpen(true);}}>Delegate to a Team</Button></div>:null}
 {open&&data?<DelegationDialog ticket={ticket} teams={data.teams} close={close} saved={()=>{close();setRevision(n=>n+1);onDelegated();}}/>:null}</div>;
}
function DelegationDialog({ticket,teams,close,saved}:{ticket:TicketRecord;teams:DelegationTeam[];close:()=>void;saved:()=>void}){
 const ticketId=ticket.id,command=useTeamCommand(),[reloading,setReloading]=useState(false),[reloadError,setReloadError]=useState<string|null>(null),[teamId,setTeamId]=useState(''),[confirmed,setConfirmed]=useState(false);
 async function reload(){if(reloading||!command.stale)return;setReloading(true);setReloadError(null);try{await Promise.all([apiClient.getTicket(ticketId),apiRequest('/api/tickets/'+ticketId+'/delegate')]);if(command.reset()){setConfirmed(false);saved();}}catch(err){setReloadError(getErrorMessage(err,'Unable to reload this request and its team assignment. Try again before choosing a team.'));}finally{setReloading(false);}}
 return <AdministrationDialog title="Delegate to a Team" locked={command.locked||reloading} onDismiss={close}><form className="stack" onSubmit={event=>{event.preventDefault();if(!teamId||!confirmed||reloading)return;void command.run('delegate',{ticketId,teamId},key=>apiRequest('/api/tickets/'+ticketId+'/delegate',{method:'POST',body:{teamId},headers:{'Idempotency-Key':key}}),saved);}}>
 <p><strong>{ticket.ticketNumber??'Request'}</strong> · {operationsStatusLabel(ticket.status)}</p>
 <p>Choose a team responsible for this Area. Its lead will choose a crew. The team receives a notification, and this request stays awaiting crew selection.</p>
 <p>This replaces any current Party Chief selection.</p>
 {teams.length?<label className="field"><span className="field-label">Responsible team</span><select aria-label="Responsible team" className="select" value={teamId} disabled={command.locked} onChange={event=>{setTeamId(event.target.value);setConfirmed(false);}}><option value="">Choose a team</option>{teams.map(team=><option key={team.id} value={team.id}>{team.name} · {team.leadName}</option>)}</select></label>:<p>No eligible team covers this Area. Set up a team and its Area coverage in Team Management.</p>}
 <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={command.locked} onChange={event=>setConfirmed(event.target.checked)}/><span>I confirm this team assignment.</span></label>
 <p>Next responsible person: {teams.find(team=>team.id===teamId)?.leadName??'Choose a team to see its lead'}.</p>
 {reloadError?<ErrorBanner message={reloadError}/>:null}{command.uncertain&&!command.busy?<p role="status">The result is uncertain. Retry the unchanged delegation to recover its recorded result.</p>:null}{command.stale?<p role="status">Reload the current request and team assignment before reviewing and confirming again.</p>:null}
 {command.error?<ErrorBanner message={command.error}/>:null}<div className="row"><Button type="submit" disabled={!teamId||!confirmed||command.busy||command.stale||reloading}>{command.busy?'Saving…':command.uncertain?'Retry unchanged delegation':'Confirm delegation'}</Button>{command.stale?<Button type="button" variant="secondary" disabled={reloading} onClick={()=>void reload()}>{reloading?'Reloading…':'Reload team assignment'}</Button>:null}</div>
 </form></AdministrationDialog>;
}
