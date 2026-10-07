'use client';

import {useRef,useState} from 'react';
import type {TicketRecord} from '@/lib/contracts';
import {apiClient,createIdempotencyKey} from '@/lib/apiClient';
import {operationsStatusLabel} from '@/lib/operations-view';
import {formatCalendarDate} from '@/lib/calendar-date';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {useUnsavedProgress} from '@/lib/use-unsaved-progress';
import {executeTicketWorkflow,ticketWorkflowReview,type TicketWorkflowAction,type TicketWorkflowIntent} from '@/lib/ticket-workflow-review';
import {AdministrationDialog} from '@/components/ui/administration-dialog';
import {Button,ErrorBanner} from '@/components/ui';

type Selection={ticket:TicketRecord;action:TicketWorkflowAction};
/** One page-wide owner prevents another row or action from replacing an uncertain attempt. */
export function useTicketWorkflowReview(onReload:()=>void) {
  const owner=useRef(new CommandOwner()),selection=useRef<Selection|null>(null);
  const [selected,setSelected]=useState<Selection|null>(null);
  function close(){selection.current=null;owner.current.release('ticket-workflow');setSelected(null);}
  return {active:!!selected,open:(ticket:TicketRecord,action:TicketWorkflowAction)=>{
    if(selection.current||!owner.current.claim('ticket-workflow'))return;
    selection.current={ticket,action};setSelected(selection.current);
  },dialog:selected?<WorkflowReview key={selected.ticket.id+selected.action} selection={selected} close={close} reloaded={()=>{close();onReload();}}/>:null};
}
function WorkflowReview({selection:{ticket,action},close,reloaded}:{selection:Selection;close:()=>void;reloaded:()=>void}) {
  const gate=useRef(new FrozenCommand<TicketWorkflowIntent>());
  const [reason,setReason]=useState(''),[requestedDate,setDate]=useState(ticket.requestedDate?.slice(0,10)??'');
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const review=ticketWorkflowReview(action,ticket),command=gate.current;
  useUnsavedProgress(command.locked);
  async function submit(){
    if(busy||!confirmed||(review.reason==='required'&&!reason.trim())||(review.date&&!requestedDate))return;
    const frozen=command.begin({ticketId:ticket.id,action,reason,requestedDate},createIdempotencyKey());
    if(!frozen)return;
    setBusy(true);setError(null);
    try {await executeTicketWorkflow(frozen.body,frozen.key);command.success();reloaded();}
    catch(err){command.fail(err instanceof ApiClientError?err.status:undefined);setError(getErrorMessage(err,'The response was not received. Retry the unchanged action to recover its result.'));}
    finally{setBusy(false);}
  }
  async function reload(){
    if(busy||!command.stale)return;
    setBusy(true);setError(null);
    try {await apiClient.getTicket(ticket.id);command.reload();setConfirmed(false);reloaded();}
    catch(err){setError(getErrorMessage(err,'Unable to reload the request. Try again before reviewing another action.'));}
    finally{setBusy(false);}
  }
  return <AdministrationDialog title={review.title} locked={command.locked||busy} onDismiss={close}>
    <form className="stack" onSubmit={event=>{event.preventDefault();void submit();}}>
      <p><strong>{ticket.ticketNumber??'Request'}</strong> · {operationsStatusLabel(ticket.status)}</p>
      <p>{review.consequence}</p><p>{review.next}</p>
      {['validate-inability','reject-inability','approve-legacy','reject-legacy'].includes(action)&&ticket.pendingPcReason?<p><strong>Recorded Report:</strong> {ticket.pendingPcReason}</p>:null}
      {review.date?<p>Current Need-By: {ticket.requestedDate?formatCalendarDate(ticket.requestedDate):'Not set'}</p>:null}
      {review.date?<label className="field"><span className="field-label">New Need-By Date</span><input className="input" type="date" required value={requestedDate} disabled={command.locked||busy} onChange={event=>{setDate(event.target.value);setConfirmed(false);}}/></label>:null}
      {review.reason?<label className="field"><span className="field-label">{review.reason==='required'?'Reason':'Reason (Optional)'}</span><textarea className="input" required={review.reason==='required'} rows={4} value={reason} disabled={command.locked||busy} onChange={event=>{setReason(event.target.value);setConfirmed(false);}}/></label>:null}
      <label className="tm-check"><input type="checkbox" checked={confirmed} disabled={command.locked||busy} onChange={event=>setConfirmed(event.target.checked)}/><span>I confirm this action for {ticket.ticketNumber??'this request'}.</span></label>
      {error?<ErrorBanner message={error}/>:null}
      {command.command&&!command.stale&&!busy?<p role="status">The result is uncertain. Keep this review open and retry the unchanged action; its original input and retry key are retained.</p>:null}
      {command.stale?<p role="status">The request or your access has changed. Reload it, then review the current action and confirm again.</p>:null}
      <div className="row"><Button type="submit" variant={review.danger?'danger':'primary'} disabled={busy||command.stale||!confirmed||(review.reason==='required'&&!reason.trim())||(!!review.date&&!requestedDate)}>{busy?'Working…':command.command&&!command.stale?'Retry Unchanged Action':review.title}</Button>
        {command.stale?<Button type="button" variant="secondary" disabled={busy} onClick={()=>void reload()}>Reload Request</Button>:<Button type="button" variant="secondary" disabled={command.locked||busy} onClick={close}>Keep Request Unchanged</Button>}
      </div>
    </form>
  </AdministrationDialog>;
}
