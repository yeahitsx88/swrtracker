import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSubmittedRecoveryTransition,SUBMITTED_RECOVERY_STATUSES} from '../../src/modules/workflow/domain/submitted-recovery';
import {assertValidTransition,type TicketStatus,type WorkflowVariant} from '../../src/modules/workflow/domain/transitions';
import {ConflictError} from '../../src/shared/errors';

test('purpose-specific recovery accepts only submitted cancelled/rejected requests in either variant',()=>{
 for(const workflowVariant of ['STANDARD_APPROVAL','DIRECT_ASSIGNMENT'] as WorkflowVariant[])for(const status of SUBMITTED_RECOVERY_STATUSES)assert.doesNotThrow(()=>assertSubmittedRecoveryTransition({workflowVariant,status,ticketNumber:'SWR-001',firstSubmittedAt:new Date()},'RETURNED_FOR_CORRECTION'));
});
test('recovery refuses unnumbered/unsubmitted, active, completed and wrong-target records',()=>{
 const proof={workflowVariant:'STANDARD_APPROVAL' as const,ticketNumber:'SWR-001',firstSubmittedAt:new Date()};
 for(const status of ['DRAFT','SUBMITTED','APPROVED','ASSIGNED','IN_PROGRESS','RETURNED_FOR_CORRECTION','COMPLETED','PENDING_FIELD_VALIDATION','PENDING_PC_APPROVAL','DELAYED'] as TicketStatus[])assert.throws(()=>assertSubmittedRecoveryTransition({...proof,status},'RETURNED_FOR_CORRECTION'),ConflictError);
 assert.throws(()=>assertSubmittedRecoveryTransition({...proof,status:'REJECTED',ticketNumber:null},'RETURNED_FOR_CORRECTION'),ConflictError);
 assert.throws(()=>assertSubmittedRecoveryTransition({...proof,status:'REJECTED',firstSubmittedAt:null},'RETURNED_FOR_CORRECTION'),ConflictError);
 for(const to of ['APPROVED','ASSIGNED','SUBMITTED','COMPLETED'] as TicketStatus[])assert.throws(()=>assertSubmittedRecoveryTransition({...proof,status:'REJECTED'},to),ConflictError);
});
test('ordinary transitions cannot recover terminal/rejected states and correction still requires fresh approval',()=>{
 for(const workflowVariant of ['STANDARD_APPROVAL','DIRECT_ASSIGNMENT'] as WorkflowVariant[]){
  for(const status of SUBMITTED_RECOVERY_STATUSES)assert.throws(()=>assertValidTransition(workflowVariant,status,'RETURNED_FOR_CORRECTION'),ConflictError);
  assertValidTransition(workflowVariant,'RETURNED_FOR_CORRECTION','SUBMITTED');
  assert.throws(()=>assertValidTransition(workflowVariant,'RETURNED_FOR_CORRECTION','ASSIGNED'),ConflictError);
 }
});
