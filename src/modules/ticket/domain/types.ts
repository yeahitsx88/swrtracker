/**
 * Ticket domain types.
 * No I/O. No imports from infrastructure or application layers.
 */
import type { UUID } from '@/shared/types';
import type { TicketStatus, WorkflowVariant } from '@/modules/workflow/domain/transitions';

export type { TicketStatus, WorkflowVariant };

/** Structured ticket categories — never free text (CLAUDE.md §4). */
export type TicketType = 'LAYOUT' | 'CHECK_OUT' | 'AS_BUILT' | 'TOPO' | 'PERMIT';

export interface Ticket {
  id: UUID;
  tenantId: UUID;
  projectId: UUID;
  areaId: UUID | null;
  subareaId: UUID | null;
  aorNodeId: UUID | null;
  departmentId: UUID | null;
  companyId: UUID;
  /** Assigned at DRAFT → SUBMITTED or direct-ticket creation; immutable thereafter. */
  ticketNumber: string | null;
  ticketType: TicketType | null;
  requesterId: UUID;
  /** Required — one Party Chief per ticket. */
  assignedPartyChiefId: UUID | null;
  /** Optional — Survey Lead may explicitly assign any Instrument Man in the project. */
  assignedInstrumentManId: UUID | null;
  surveyLeadId: UUID | null;
  surveySuperintendentId: UUID | null;
  surveyManagerId: UUID | null;
  workflowVariant: WorkflowVariant;
  status: TicketStatus;
  craft: string | null;
  description: string | null;
  requestedDate: Date | null;
  draftLastSavedAt: Date | null;
  draftDeletedAt: Date | null;
  draftDeletedReason: 'REQUESTER_DELETED' | 'USER_DEACTIVATED' | 'AUTO_EXPIRED' | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  closedAt: Date | null;
  canceledAt: Date | null;
  pendingFieldStatus: 'COMPLETED' | 'DELAYED' | 'FIELD_CANCELED' | null;
  pendingFieldReason: string | null;
  pendingFieldInitiatedBy: UUID | null;
  delayedReason: string | null;
  cancelReason: string | null;
  cancelInitiatedBy: UUID | null;
  cancelInitiatedAt: Date | null;
  cancelInitiatorRole: string | null;
  cancelApprovedBy: UUID | null;
  /** Required when status is REJECTED. */
  rejectionReason: string | null;
  rejectedAt: Date | null;
  /** Set on resubmission after rejection — links to the rejected ticket. */
  parentTicketId: UUID | null;
  priority: 'HIGH' | 'MED_HIGH' | 'MEDIUM' | 'NORMAL';
  prioritySetBy: UUID | null;
  prioritySetReason: string | null;
  /** Set only on Path B manual elevation. */
  priorityElevatedBy: UUID | null;
  /** Required when priorityElevatedBy is set. */
  priorityElevatedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
