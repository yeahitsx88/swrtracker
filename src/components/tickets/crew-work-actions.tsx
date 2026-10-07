'use client';
import type {TicketRecord} from '@/lib/contracts';
import type {TicketWorkflowAction} from '@/lib/ticket-workflow-review';
import {Button} from '@/components/ui';

export function CrewWorkActions({ticket,busy=false,onReview}:{ticket:TicketRecord;busy?:boolean;onReview:(action:TicketWorkflowAction)=>void}) {
  if(ticket.status==='ASSIGNED')return <Button disabled={busy} onClick={()=>onReview('start')}>Start Work</Button>;
  if(ticket.status==='IN_PROGRESS')return <div className="crew-work-actions">
    <Button disabled={busy} onClick={()=>onReview('complete')}>Complete Work</Button>
    <Button variant="secondary" disabled={busy} onClick={()=>onReview('delay')}>Mark Delayed</Button>
    <Button variant="secondary" disabled={busy} onClick={()=>onReview('inability')}>Report Unable to Perform</Button>
    <Button variant="danger" disabled={busy||!!ticket.surveyCancelRequestedAt} onClick={()=>onReview('stop')}>Flag Stop Work</Button>
    {ticket.surveyCancelRequestedAt?<p role="status">Stop-work review is pending.</p>:null}
  </div>;
  if(ticket.status==='DELAYED')return <div className="crew-work-actions"><p className="muted">Your Party Chief or authorized survey lead can restart this work.</p>
    <Button variant="danger" disabled={busy||!!ticket.surveyCancelRequestedAt} onClick={()=>onReview('stop')}>Flag Stop Work</Button>
    {ticket.surveyCancelRequestedAt?<p role="status">Stop-work review is pending.</p>:null}
  </div>;
  return <p className="muted">No field action is available for this request's current state.</p>;
}
