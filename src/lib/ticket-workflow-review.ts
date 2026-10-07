import type { TicketRecord } from './contracts';
import { apiClient } from './apiClient';

export type TicketWorkflowAction = 'start' | 'complete' | 'delay' | 'inability' | 'stop' | 'restart' |
  'validate-inability' | 'reject-inability' | 'approve-legacy' | 'reject-legacy' |
  'requester-cancel' | 'follow-up' | 'approve' | 'return' | 'cancel' | 'need-by' | 'high' | 'normal';
export interface TicketWorkflowIntent { ticketId: string; action: TicketWorkflowAction; reason: string; requestedDate: string }
export interface TicketWorkflowReview { title: string; consequence: string; next: string; reason: 'required' | 'optional' | false; date?: boolean; danger?: boolean }

/** Presentation of established transitions. This never grants authority or selects a new transition. */
export function ticketWorkflowReview(action: TicketWorkflowAction, ticket: Pick<TicketRecord,'pendingPcOutcome'>): TicketWorkflowReview {
  switch (action) {
    case 'start': return {title:'Start Work',consequence:'Record that you have started this assigned request.',next:'You can complete the work, report a delay or report that it cannot proceed.',reason:false};
    case 'complete': return {title:'Complete Work',consequence:'Record successful completion of this request. Completion is retained in its history.',next:'The requester will be notified. Successful completion needs no Party Chief approval.',reason:false};
    case 'delay': return {title:'Mark Delayed',consequence:'Record why this work is delayed. The request remains open.',next:'Your Party Chief or authorized survey lead can restart the work.',reason:'required'};
    case 'inability': return {title:'Report Unable to Perform',consequence:'Send the reason this work cannot proceed for field-report review.',next:'The responsible Party Chief or authorized survey lead reviews the report before a return for requester correction.',reason:'required'};
    case 'stop': return {title:'Flag Stop Work',consequence:'Request permanent cancellation and record your reason. This does not immediately cancel the request.',next:'Authorized survey leadership must review the stop-work request.',reason:'required',danger:true};
    case 'restart': return {title:'Restart Delayed Work',consequence:'Return this delayed request to work in progress.',next:'The assigned Instrument Man can continue the field work.',reason:false};
    case 'validate-inability': return {title:'Validate and Return',consequence:'Validate the inability report and return this same request for correction.',next:'The requester corrects and resubmits it with the same reference and retained history.',reason:'required'};
    case 'reject-inability': return {title:'Reject Report and Resume',consequence:'Reject the inability report and return the request to work in progress.',next:'The assigned Instrument Man can resume work. Your reason is retained.',reason:'required'};
    case 'approve-legacy': return {title:ticket.pendingPcOutcome==='DELAYED'?'Confirm Recorded Delay':ticket.pendingPcOutcome==='FIELD_CANCELED'?'Approve Field Cancellation':'Confirm Recorded Completion',consequence:'Resolve this retained field report using its recorded outcome. This is a legacy report, not an approval required for new successful completions.',next:ticket.pendingPcOutcome==='DELAYED'?'The request remains delayed until an authorized restart.':'The requester will be notified of the recorded outcome.',reason:false,danger:ticket.pendingPcOutcome==='FIELD_CANCELED'};
    case 'reject-legacy': return {title:'Reject Report and Resume',consequence:'Reject this retained field report and return the request to work in progress.',next:'The assigned Instrument Man can resume work.',reason:'optional'};
    case 'requester-cancel': return {title:'Cancel My Request',consequence:'Permanently cancel your saved request and stop its current workflow. Its reference, files and history remain.',next:'Assigned field staff will be notified. This does not return the request for correction.',reason:false,danger:true};
    case 'follow-up': return {title:'Create Follow-Up Request',consequence:'Create a new draft linked to this completed request. The completed record and its history stay unchanged.',next:'Review the new draft, its fields and files before submitting it for fresh approval.',reason:false};
    case 'approve': return {title:'Approve Request',consequence:'Approve this request for survey work. Approval does not assign an Instrument Man.',next:'The responsible survey coordinator must arrange the crew before field work starts.',reason:false};
    case 'return': return {title:'Return for Correction',consequence:'Return this same request with your reason, retaining its reference and history.',next:'The requester corrects and resubmits it for fresh review.',reason:'required'};
    case 'cancel': return {title:'Cancel Request',consequence:'Permanently cancel this request. This is different from returning it for correction.',next:'The requester and applicable assigned field staff will be notified.',reason:'required',danger:true};
    case 'need-by': return {title:'Revise Need-By Date',consequence:'Change the current Need-By date with a recorded reason. The original date and history remain.',next:'The requester will be notified. Survey priority remains unchanged.',reason:'required',date:true};
    case 'high': case 'normal': return {title:action==='high'?'Set High Priority':'Set Normal Priority',consequence:'Change survey sequencing priority with a recorded reason.',next:'The Need-By date remains unchanged.',reason:'required'};
  }
}

export function executeTicketWorkflow(intent: TicketWorkflowIntent, key: string) {
  const {ticketId,action,reason,requestedDate}=intent;
  switch(action) {
    case 'requester-cancel': return apiClient.requesterCancel(ticketId,key);
    case 'follow-up': return apiClient.createFollowUpTicket(ticketId,key);
    case 'start': return apiClient.startTicket(ticketId,key);
    case 'complete': return apiClient.completeTicket(ticketId,key);
    case 'delay': return apiClient.delayTicket(ticketId,reason,key);
    case 'inability': return apiClient.reportFieldInability(ticketId,reason,key);
    case 'stop': case 'cancel': return apiClient.surveyCancel(ticketId,reason,key);
    case 'restart': return apiClient.restartDelayedTicket(ticketId,key);
    case 'validate-inability': return apiClient.validateFieldInability(ticketId,reason,key);
    case 'reject-inability': return apiClient.rejectFieldInability(ticketId,reason,key);
    case 'approve-legacy': return apiClient.approvePcStatus(ticketId,key);
    case 'reject-legacy': return apiClient.rejectPcStatus(ticketId,reason||undefined,key);
    case 'approve': return apiClient.approveTicket(ticketId,key);
    case 'return': return apiClient.returnForCorrection(ticketId,reason,key);
    case 'need-by': return apiClient.reviseNeedBy(ticketId,requestedDate,reason,key);
    case 'high': case 'normal': return apiClient.revisePriority(ticketId,action==='high'?'HIGH':'NORMAL',reason,key);
  }
}
