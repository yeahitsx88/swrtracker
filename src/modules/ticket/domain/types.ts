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
  areaId: UUID;
  subareaId: UUID;
  companyId: UUID;
  /** Human-readable number, e.g. FSS-U1-00247. Immutable after creation. */
  ticketNumber: string;
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
  completedAt: Date | null;
  closedAt: Date | null;
  /** Required when status is REJECTED. */
  rejectionReason: string | null;
  /** Set on resubmission after rejection — links to the rejected ticket. */
  parentTicketId: UUID | null;
  isPriority: boolean;
  /** Set only on Path B manual elevation. */
  priorityElevatedBy: UUID | null;
  /** Required when priorityElevatedBy is set. */
  priorityElevatedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
