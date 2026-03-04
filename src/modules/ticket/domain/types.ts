/**
 * Ticket domain types.
 * No I/O. No imports from infrastructure or application layers.
 */
import type { UUID } from '@/shared/types';
import type { TicketStatus, WorkflowVariant } from '@/modules/workflow/domain/transitions';

export type { TicketStatus, WorkflowVariant };

/** Structured ticket categories — never free text (CLAUDE.md §4). */
export type TicketType = 'LAYOUT' | 'CHECK_OUT' | 'AS_BUILT' | 'TOPO' | 'PERMIT';
export type PendingPcOutcome = 'COMPLETED' | 'DELAYED' | 'FIELD_CANCELED';
export type TicketPriority = 'HIGH' | 'MED_HIGH' | 'MEDIUM' | 'NORMAL';

export interface Ticket {
  id: UUID;
  tenantId: UUID;
  projectId: UUID;
  aorNodeId: UUID;
  departmentId: UUID | null;
  companyId: UUID;
  /** Human-readable number, e.g. FSS-U1-00247. Assigned on DRAFT -> SUBMITTED and immutable after that. */
  ticketNumber: string | null;
  ticketType: TicketType;
  requesterId: UUID;
  /** Required — one Party Chief per ticket. */
  assignedPartyChiefId: UUID | null;
  /** Optional — Survey Lead may explicitly assign any Instrument Man in the project. */
  assignedInstrumentManId: UUID | null;
  surveyLeadId: UUID | null;
  workflowVariant: WorkflowVariant;
  status: TicketStatus;
  craft: string;
  description: string;
  requestedDate: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  pendingPcOutcome: PendingPcOutcome | null;
  pendingPcReason: string | null;
  surveyCancelRequestedBy: UUID | null;
  surveyCancelRequestedRole: string | null;
  surveyCancelReason: string | null;
  surveyCancelRequestedAt: Date | null;
  completedAt: Date | null;
  closedAt: Date | null;
  /** Required when status is REJECTED. */
  rejectionReason: string | null;
  /** Set on resubmission after rejection — links to the rejected ticket. */
  parentTicketId: UUID | null;
  priority: TicketPriority;
  prioritySetBy: UUID | null;
  prioritySetReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
