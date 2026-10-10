'use client';
import {useEffect,useState} from 'react';
import {apiClient,apiRequest} from '@/lib/apiClient';
import type {RejectionProposal,ReviewDecisionRead} from '@/modules/ticket/application/rejection-proposal';
import type {TicketRecord} from '@/lib/contracts';
import {getErrorMessage} from '@/lib/errors';
import {blockersFrom} from '@/components/ui/action-blockers';
import {Button,ErrorBanner} from '@/components/ui';
import {AdministrationDialog} from '@/components/ui/administration-dialog';
import {useTeamCommand} from '@/components/ui/team-management';
import {TicketDetails} from './ticket-details';

/**
 * The established survey review decision (approve, reject, or propose rejection); one dialog for every entry point.
 * `reloadScope` names what Reload re-reads: the review queue, or the one request in Request Details.
 */
export function ReviewDecision({ticket,canReject,reload,done,areaPath,showDetails=true,reloadScope='queue'}:{ticket:TicketRecord;canReject:boolean;reload:()=>Promise<void>;done:(message?:string)=>void;areaPath?:string;showDetails?:boolean;reloadScope?:'queue'|'request'}){
  const reloadLabel=reloadScope==='queue'?'Reload requests':'Reload request';
  const command=useTeamCommand(),[action,setAction]=useState<'approve'|'reject'>('approve'),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [proposal,setProposal]=useState<RejectionProposal|null>(),[loadError,setLoadError]=useState(false);
  const [decision,setDecision]=useState<ReviewDecisionRead['decision']>();
  const [reloading,setReloading]=useState(false),[reloadError,setReloadError]=useState<string>();
  async function reloadDecision(){if(reloading||command.busy||command.uncertain)return;setReloading(true);setReloadError(undefined);try{await reload();if(command.reset())done();}catch(cause){setReloadError(getErrorMessage(cause,`Unable to load current review information. Keep this decision open and retry ${reloadLabel}.`));}finally{setReloading(false);}}
  useEffect(()=>{let active=true;apiRequest<ReviewDecisionRead>('/api/tickets/'+ticket.id+'/rejection-proposal').then(data=>{if(active){setProposal(data.proposal);setDecision(data.decision);}}).catch(()=>{if(active)setLoadError(true);});return()=>{active=false;};},[ticket.id]);
  const blocked=proposal===undefined||decision?.available!==true||(!canReject&&!!proposal);
  const valid=!blocked&&!reloading&&confirmed&&(action==='approve'||!!reason.trim());
  return <AdministrationDialog title="Review request" locked={command.locked||reloading} onDismiss={()=>done()}><form className="stack" onSubmit={event=>{event.preventDefault();if(!valid)return;void command.run(action,{ticketId:ticket.id,reason},key=>action==='approve'?apiClient.approveTicket(ticket.id,key):canReject?apiClient.rejectTicket(ticket.id,reason,key):apiRequest('/api/tickets/'+ticket.id+'/rejection-proposal',{method:'POST',body:{reason},headers:{'Idempotency-Key':key}}),()=>done(action==='approve'?'Request approved. It is ready for assignment.':canReject?'Request rejected.':'Rejection proposed. A Superintendent or Survey Manager will review it.'));}}>
    {showDetails?<TicketDetails ticket={ticket} areaPath={areaPath}/>:<p><strong>{ticket.ticketNumber??'Request'}</strong> · {ticket.description}</p>}
    {proposal?<section aria-label="Proposed rejection"><h3>A Party Chief proposed rejection</h3><p>{proposal.reason}</p><p>{canReject?'Review the reason, then reject the request or approve it instead.':'Waiting for a Superintendent or Survey Manager to decide.'}</p></section>:proposal===undefined?<p role="status">{loadError?'Unable to load review details. Close this dialog and try again.':'Loading review details…'}</p>:null}
    {decision?.available===false?<p role="status">{decision.reason}</p>:null}
    <label className="field" id="rv-decision"><span className="field-label">Decision</span><select aria-label="Decision" className="select" value={action} disabled={command.locked||reloading||blocked} onChange={event=>{setAction(event.target.value as 'approve'|'reject');setConfirmed(false);}}><option value="approve">{proposal?'Approve instead':'Approve request'}</option><option value="reject">{canReject?'Reject request':'Propose rejection'}</option></select></label>
    {action==='reject'?<label className="field" id="rv-reason"><span className="field-label">{canReject?'Reason for rejection':'Reason for proposed rejection'}</span><textarea className="textarea" required maxLength={2000} value={reason} disabled={command.locked||reloading||blocked} onChange={event=>{setReason(event.target.value);setConfirmed(false);}}/></label>:null}
    <p>{action==='approve'?'Approval makes this request ready for crew assignment. A Survey Manager or authorized team leader chooses the crew next.':canReject?'Rejection ends ordinary review and retains the written decision in request history. Any recovery requires a separate authorized review.':'A proposal keeps this request Submitted. A covering Superintendent or Survey Manager must approve it or confirm rejection before crew assignment.'}</p>
    <label className="tm-check" id="rv-confirm"><input type="checkbox" checked={confirmed} disabled={command.locked||reloading||blocked} onChange={event=>setConfirmed(event.target.checked)}/><span>I have reviewed this request and confirm my decision.</span></label>
    {command.stale?<p role="alert">{reloadError?'Current review information could not be loaded.':'This review changed.'} Your reviewed decision remains held. {reloadLabel} must successfully read the current {reloadScope==='queue'?'queue':'request'} and project access before a new review.</p>:null}
    {reloadError?<ErrorBanner message={reloadError}/>:command.error&&!command.stale?<ErrorBanner message={command.error}/>:null}<div className="row"><Button type="submit" disabled={command.busy||command.stale||reloading} blockedTitle="Can’t confirm yet" blockers={command.uncertain?[]:blockersFrom([
     [proposal===undefined,loadError?'Review details could not be loaded. Close this dialog and try again.':'Review details are still loading.'],
     [decision?.available===false,decision?.reason??'This request can’t be reviewed right now.'],
     [!canReject&&!!proposal,'A rejection is already proposed and waiting for a Superintendent or Survey Manager.'],
     [action==='reject'&&!reason.trim(),'Write the reason for this rejection. The requester sees it.','rv-reason'],
     [!confirmed,'Tick the confirmation box.','rv-confirm'],
    ])}>{command.busy?'Saving…':command.uncertain?'Retry unchanged decision':'Confirm decision'}</Button>{command.stale?<Button variant="secondary" type="button" disabled={reloading} onClick={()=>void reloadDecision()}>{reloading?'Reloading…':reloadLabel}</Button>:null}</div>
  </form></AdministrationDialog>;
}
