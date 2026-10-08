'use client';
import type {TicketRecord} from '@/lib/contracts';
import {ticketWorkflowReview,type TicketWorkflowAction} from '@/lib/ticket-workflow-review';
import {Button} from '@/components/ui';

/** Retained legacy field reports only; new successful completions require no approval. */
export function ApprovalActions({ticket,busy=false,completionOnly=false,onReview}:{ticket:TicketRecord;busy?:boolean;completionOnly?:boolean;onReview:(action:TicketWorkflowAction)=>void}) {
  if(ticket.status!=='PENDING_PC_APPROVAL')return <p className="muted">This request is not waiting for field-report review.</p>;
  if(!ticket.pendingPcOutcome)return <p className="muted">This retained report has no recorded outcome to review.</p>;
  return <><Button disabled={busy} onClick={()=>onReview('approve-legacy')}>{ticketWorkflowReview('approve-legacy',ticket).title}</Button>
    <Button variant="secondary" disabled={busy||completionOnly} onClick={()=>onReview('reject-legacy')}>Reject Report and Resume</Button></>;
}
