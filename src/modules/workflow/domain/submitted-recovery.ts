import {ConflictError} from '@/shared/errors';
import type {TicketStatus,WorkflowVariant} from './transitions';

export const SUBMITTED_RECOVERY_STATUSES = ['REJECTED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED'] as const;
export type SubmittedRecoveryStatus = typeof SUBMITTED_RECOVERY_STATUSES[number];
export function assertSubmittedRecoveryTransition(ticket:{workflowVariant:WorkflowVariant;status:TicketStatus;ticketNumber:string|null;firstSubmittedAt?:Date|null},to:TicketStatus):void {
 if(to!=='RETURNED_FOR_CORRECTION'||!SUBMITTED_RECOVERY_STATUSES.includes(ticket.status as SubmittedRecoveryStatus)||!ticket.ticketNumber||!ticket.firstSubmittedAt)throw new ConflictError('Only cancelled or rejected submitted requests may be recovered for correction.');
}
