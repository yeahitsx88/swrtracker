'use client';
import type {TicketRecord} from '@/lib/contracts';
import {ticketWorkflowReview,type TicketWorkflowAction} from '@/lib/ticket-workflow-review';
import {Button} from '@/components/ui';

/** Retained legacy field reports only; new successful completions require no approval. */
export function ApprovalActions({ticket,busy=false,onReview}:{ticket:TicketRecord;busy?:boolean;onReview:(action:TicketWorkflowAction)=>void}) {
  if(ticket.status!=='PENDING_PC_APPROVAL')return <p className="muted">This request is not waiting for field-report review.</p>;
  return <><Button disabled={busy} onClick={()=>onReview('approve-legacy')}>{ticketWorkflowReview('approve-legacy',ticket).title}</Button>
    <Button variant="secondary" disabled={busy} onClick={()=>onReview('reject-legacy')}>Reject Report and Resume</Button></>;
}
