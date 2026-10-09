import assert from 'node:assert/strict';
import test from 'node:test';
import { getTicketCapabilities } from '@/modules/ticket/application/get-ticket-capabilities';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { UUID } from '@/shared/types';

const id = (value: string) => value as UUID;
const ALL_AVAILABLE = {ordinary: true, submit: true, requesterCancel: true, deleteDraft: true, approveSurveyCancel: true};
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
  const capabilities = getTicketCapabilities(baseTicket, { id: id('requester-1'), role: 'REQUESTER' }, ALL_AVAILABLE);
  assert.equal(capabilities.canEditRequesterFields, true);
  assert.equal(capabilities.canSubmit, true);
  assert.equal(capabilities.canUploadRequestInstruction, true);
  assert.equal(capabilities.canRequesterCancel, true);
  assert.equal(capabilities.canUploadFieldSupport, false);
});

test('company authority viewing another requester draft receives no mutation capabilities', () => {
  const capabilities = getTicketCapabilities(baseTicket, { id: id('authority-1'), role: 'REQUESTER' }, ALL_AVAILABLE);
  assert.deepEqual(capabilities, {
    canEditRequesterFields: false,
    canSubmit: false,
    canDeleteDraft: false,
    canApproveSurveyCancel: false,
    canRequesterCancel: false,
    canCreateFollowUp: false,
    canUploadRequestInstruction: false,
    canUploadFieldSupport: false,
  });
});

test('active-work field upload follows Survey Lead and assignment boundaries', () => {
  const ticket = { ...baseTicket, status: 'IN_PROGRESS' as const };
  assert.equal(getTicketCapabilities(ticket, { id: id('lead-1'), role: 'SURVEY_MANAGER' }, ALL_AVAILABLE).canUploadFieldSupport, true);
  assert.equal(getTicketCapabilities(ticket, { id: id('chief-1'), role: 'PARTY_CHIEF' }, ALL_AVAILABLE).canUploadFieldSupport, true);
  assert.equal(getTicketCapabilities(ticket, { id: id('instrument-1'), role: 'INSTRUMENT_MAN' }, ALL_AVAILABLE).canUploadFieldSupport, true);
  assert.equal(getTicketCapabilities(ticket, { id: id('other-chief'), role: 'PARTY_CHIEF' }, ALL_AVAILABLE).canUploadFieldSupport, false);
});

test('completed owner can create a follow-up but cannot mutate the sealed parent', () => {
  const ticket = { ...baseTicket, status: 'COMPLETED' as const, completedAt: new Date() };
  const capabilities = getTicketCapabilities(ticket, { id: id('requester-1'), role: 'REQUESTER' }, ALL_AVAILABLE);
  assert.equal(capabilities.canCreateFollowUp, true);
  assert.equal(capabilities.canEditRequesterFields, false);
  assert.equal(capabilities.canRequesterCancel, false);
  assert.equal(capabilities.canUploadRequestInstruction, false);
});


test('ordinary work restrictions retain separate cleanup capabilities and role authority', () => {
  const actors = [
    {id: id('requester-1'), role: 'REQUESTER' as const},
    {id: id('lead-1'), role: 'SURVEY_MANAGER' as const},
    {id: id('chief-1'), role: 'PARTY_CHIEF' as const},
    {id: id('instrument-1'), role: 'INSTRUMENT_MAN' as const},
    {id: id('viewer-1'), role: 'VIEWER' as const},
  ];
  for (const status of ['DRAFT', 'RETURNED_FOR_CORRECTION', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] as const) {
    for (const actor of actors) {
      const ticket = {...baseTicket, status};
      const ordinary = getTicketCapabilities(ticket, actor, ALL_AVAILABLE);
      const restricted = getTicketCapabilities(ticket, actor, {...ALL_AVAILABLE, ordinary: false});
      assert.deepEqual(restricted, {...ordinary, canEditRequesterFields: false, canCreateFollowUp: false, canUploadRequestInstruction: false, canUploadFieldSupport: false});
    }
  }
});


test('witnessed draft cleanup stays separate from edit/submit and immutable history', () => {
  const blocked = {ordinary: false, submit: false, requesterCancel: true, deleteDraft: true, approveSurveyCancel: true};
  const cleanup = getTicketCapabilities(baseTicket, {id: id('requester-1'), role: 'REQUESTER'}, blocked);
  assert.equal(cleanup.canEditRequesterFields, false);
  assert.equal(cleanup.canSubmit, false);
  assert.equal(cleanup.canDeleteDraft, true);
  assert.equal(cleanup.canRequesterCancel, true);
  const returned = getTicketCapabilities({...baseTicket, status: 'RETURNED_FOR_CORRECTION'}, {id: id('requester-1'), role: 'REQUESTER'}, blocked);
  assert.equal(returned.canDeleteDraft, false);
  const archived = getTicketCapabilities(baseTicket, {id: id('requester-1'), role: 'REQUESTER'}, {ordinary: false, submit: false, requesterCancel: false, deleteDraft: false, approveSurveyCancel: false});
  assert(Object.values(archived).every(value => value === false));
  const initial = getTicketCapabilities(baseTicket, {id: id('requester-1'), role: 'REQUESTER'}, {...ALL_AVAILABLE, submit: false});
  assert.equal(initial.canEditRequesterFields, true);
  assert.equal(initial.canSubmit, false);
  assert.equal(initial.canDeleteDraft, true);
});


test('stop-work approval availability requires current Manager, recorded chain, cancellable state and writer availability', () => {
  const pending = {...baseTicket, status: 'IN_PROGRESS' as const, surveyCancelRequestedAt: new Date(), surveyCancelRequestedRole: 'PARTY_CHIEF'};
  const manager = {id: id('lead-1'), role: 'SURVEY_MANAGER' as const};
  assert.equal(getTicketCapabilities(pending, manager, ALL_AVAILABLE).canApproveSurveyCancel, true);
  assert.equal(getTicketCapabilities(pending, manager, {...ALL_AVAILABLE, ordinary: false}).canApproveSurveyCancel, true);
  assert.equal(getTicketCapabilities(pending, manager, {...ALL_AVAILABLE, approveSurveyCancel: false}).canApproveSurveyCancel, false);
  assert.equal(getTicketCapabilities({...pending, surveyCancelRequestedAt: null}, manager, ALL_AVAILABLE).canApproveSurveyCancel, false);
  assert.equal(getTicketCapabilities({...pending, surveyCancelRequestedRole: null}, manager, ALL_AVAILABLE).canApproveSurveyCancel, false);
  assert.equal(getTicketCapabilities({...pending, status: 'COMPLETED'}, manager, ALL_AVAILABLE).canApproveSurveyCancel, false);
  for (const role of ['REQUESTER','VIEWER','PROJECT_ADMIN','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'] as const) assert.equal(getTicketCapabilities(pending,{id:id('other-actor'),role},ALL_AVAILABLE).canApproveSurveyCancel,false);
});
