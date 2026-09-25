import assert from 'node:assert/strict';
import test from 'node:test';
import { getTicketCapabilities } from '@/modules/ticket/application/get-ticket-capabilities';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { UUID } from '@/shared/types';

const id = (value: string) => value as UUID;
const baseTicket: Ticket = {
  id: id('ticket-1'), tenantId: id('tenant-1'), projectId: id('project-1'),
  aorNodeId: id('area-1'), departmentId: null, companyId: id('company-1'), ticketNumber: 'SWR-1',
  ticketType: 'LAYOUT', requesterId: id('requester-1'), assignedPartyChiefId: id('chief-1'),
  assignedInstrumentManId: id('instrument-1'), surveyLeadId: id('lead-1'), workflowVariant: 'STANDARD_APPROVAL',
  status: 'DRAFT', craft: 'Civil', description: 'Capability test', requestedDate: new Date(),
  submittedAt: null, approvedAt: null, assignedAt: null, startedAt: null, pendingPcOutcome: null,
  pendingPcReason: null, surveyCancelRequestedBy: null, surveyCancelRequestedRole: null,
  surveyCancelReason: null, surveyCancelRequestedAt: null, completedAt: null, closedAt: null,
  rejectionReason: null, parentTicketId: null, priority: 'NORMAL', prioritySetBy: null,
  prioritySetReason: null, createdAt: new Date(), updatedAt: new Date(),
};

test('original requester receives edit, submit, instruction upload, and cancel capabilities on a draft', () => {
  const capabilities = getTicketCapabilities(baseTicket, { id: id('requester-1'), role: 'REQUESTER' });
  assert.equal(capabilities.canEditRequesterFields, true);
  assert.equal(capabilities.canSubmit, true);
  assert.equal(capabilities.canUploadRequestInstruction, true);
  assert.equal(capabilities.canRequesterCancel, true);
  assert.equal(capabilities.canUploadFieldSupport, false);
});

test('company authority viewing another requester draft receives no mutation capabilities', () => {
  const capabilities = getTicketCapabilities(baseTicket, { id: id('authority-1'), role: 'REQUESTER' });
  assert.deepEqual(capabilities, {
    canEditRequesterFields: false,
    canSubmit: false,
    canRequesterCancel: false,
    canCreateFollowUp: false,
    canUploadRequestInstruction: false,
    canUploadFieldSupport: false,
  });
});

test('active-work field upload follows Survey Lead and assignment boundaries', () => {
  const ticket = { ...baseTicket, status: 'IN_PROGRESS' as const };
  assert.equal(getTicketCapabilities(ticket, { id: id('lead-1'), role: 'SURVEY_MANAGER' }).canUploadFieldSupport, true);
  assert.equal(getTicketCapabilities(ticket, { id: id('chief-1'), role: 'PARTY_CHIEF' }).canUploadFieldSupport, true);
  assert.equal(getTicketCapabilities(ticket, { id: id('instrument-1'), role: 'INSTRUMENT_MAN' }).canUploadFieldSupport, true);
  assert.equal(getTicketCapabilities(ticket, { id: id('other-chief'), role: 'PARTY_CHIEF' }).canUploadFieldSupport, false);
});

test('completed owner can create a follow-up but cannot mutate the sealed parent', () => {
  const ticket = { ...baseTicket, status: 'COMPLETED' as const, completedAt: new Date() };
  const capabilities = getTicketCapabilities(ticket, { id: id('requester-1'), role: 'REQUESTER' });
  assert.equal(capabilities.canCreateFollowUp, true);
  assert.equal(capabilities.canEditRequesterFields, false);
  assert.equal(capabilities.canRequesterCancel, false);
  assert.equal(capabilities.canUploadRequestInstruction, false);
});
