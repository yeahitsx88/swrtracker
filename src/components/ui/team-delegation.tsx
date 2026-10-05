'use client';
import {useEffect,useState} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {Button,ErrorBanner} from '@/components/ui';
import {AdministrationDialog} from './administration-dialog';
import {useTeamCommand} from './team-management';
import type {DelegationTeam} from '@/modules/ticket/application/delegate-work';
interface Options {teams:DelegationTeam[];current:{teamId:string;teamName:string;leadName:string}|null}
export function TeamDelegation({ticketId,canDelegate,onDelegated}:{ticketId:string;canDelegate:boolean;onDelegated:()=>void}){
 const [data,setData]=useState<Options>(),[loadError,setLoadError]=useState(false),[revision,setRevision]=useState(0),[open,setOpen]=useState(false);
 useEffect(()=>{let active=true;setLoadError(false);apiRequest<Options>('/api/tickets/'+ticketId+'/delegate').then(value=>{if(active)setData(value);}).catch(()=>{if(active)setLoadError(true);});return()=>{active=false;};},[ticketId,revision]);
 return <div className="stack">{data?.current?<p role="status"><strong>Awaiting crew selection:</strong> {data.current.teamName} · {data.current.leadName}</p>:null}
 {loadError?<div><ErrorBanner message="Unable to load team assignment."/><Button variant="secondary" onClick={()=>setRevision(n=>n+1)}>Reload team assignment</Button></div>:null}
 {canDelegate?<div><Button variant="secondary" disabled={!data||loadError} onClick={()=>setOpen(true)}>Delegate to a team</Button></div>:null}
 {open&&data?<DelegationDialog ticketId={ticketId} teams={data.teams} close={()=>setOpen(false)} saved={()=>{setOpen(false);setRevision(n=>n+1);onDelegated();}}/>:null}</div>;
}
function DelegationDialog({ticketId,teams,close,saved}:{ticketId:string;teams:DelegationTeam[];close:()=>void;saved:()=>void}){
 const command=useTeamCommand(),[teamId,setTeamId]=useState(''),[confirmed,setConfirmed]=useState(false);
 return <AdministrationDialog title="Delegate to a team" locked={command.locked} onDismiss={close}><form className="stack" onSubmit={event=>{event.preventDefault();if(!teamId||!confirmed)return;void command.run('delegate',{ticketId,teamId},key=>apiRequest('/api/tickets/'+ticketId+'/delegate',{method:'POST',body:{teamId},headers:{'Idempotency-Key':key}}),saved);}}>
 <p>Choose a team responsible for this Area. Its lead will choose a crew. The team receives a notification, and this request stays awaiting crew selection.</p>
 <p>This replaces any current Party Chief selection.</p>
 {teams.length?<label className="field"><span className="field-label">Responsible team</span><select aria-label="Responsible team" className="select" value={teamId} disabled={command.locked} onChange={event=>{setTeamId(event.target.value);setConfirmed(false);}}><option value="">Choose a team</option>{teams.map(team=><option key={team.id} value={team.id}>{team.name} · {team.leadName}</option>)}</select></label>:<p>No eligible team covers this Area. Set up a team and its Area coverage in Team Management.</p>}
 <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={command.locked} onChange={event=>setConfirmed(event.target.checked)}/><span>I confirm this team assignment.</span></label>
 {command.error?<ErrorBanner message={command.error}/>:null}<div className="row"><Button type="submit" disabled={!teamId||!confirmed||command.busy||command.stale}>{command.busy?'Saving…':command.uncertain?'Retry unchanged delegation':'Confirm delegation'}</Button>{command.stale?<Button type="button" variant="secondary" onClick={()=>{if(command.reset())saved();}}>Reload team assignment</Button>:null}</div>
 </form></AdministrationDialog>;
}
