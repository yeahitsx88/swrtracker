export interface RequestDraft {
  id: string;
  projectId: string;
  status: string;
  ticketNumber: string | null;
  aorNodeId: string | null;
  departmentId: string | null;
  ticketType: string | null;
  craft: string | null;
  description: string | null;
  requestedDate: string | null;
  draftLastSavedAt: string | null;
}

export interface RequestTicket extends RequestDraft {
  canActivateCad: boolean;
  canSignOffCad: boolean;
  cadProgressAction: 'START' | 'SUBMIT_QA' | null;
  cad: { status: 'NOT_REQUIRED' | 'NOT_STARTED' | 'IN_PROGRESS' | 'QA_PENDING' | 'COMPLETE'; completedAt: string | null } | null;
  surveySuperintendentId: string | null;
  superintendentName: string | null;
  superintendentReassignment: boolean;
  assignedPartyChiefId: string | null;
  assignedInstrumentManId: string | null;
  reassignment: { crewBuild: 'FULL' | 'MEDIUM' | 'SLIM'; canChangePartyChief: boolean;
    instrumentManRequired: boolean } | null;
  priority: 'NORMAL' | 'MEDIUM' | 'MED_HIGH' | 'HIGH';
  priorityActions: { canElevate: boolean; lowerChoices: Array<'NORMAL' | 'MEDIUM' | 'MED_HIGH' | 'HIGH'> };
  surveyCancelActions: { canInitiate: boolean; canApprove: boolean; immediate: boolean; pending: boolean };
  fieldActions: { canStart: boolean; canReport: boolean; canRequestFieldCancel: boolean;
    canResolve: boolean; canRestart: boolean; canCompleteDirectly: boolean };
  pendingFieldStatus: 'COMPLETED' | 'DELAYED' | 'FIELD_CANCELED' | null;
  pendingFieldReason: string | null;
  assignment: { crewBuild: 'FULL' | 'MEDIUM' | 'SLIM' } | null;
  reviewActions: { canReview: boolean; canOverride: boolean };
  requesterActions: { canCancel: boolean; canResubmit: boolean };
  displayStatus: string;
  projectName: string;
  locationName: string | null;
  departmentName: string | null;
  partyChiefName: string | null;
  instrumentManName: string | null;
  submittedAt: string | null;
  rejectionReason: string | null;
  delayedReason: string | null;
  cancelReason: string | null;
}

export function localDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
