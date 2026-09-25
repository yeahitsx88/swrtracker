/**
 * Workflow domain — Section 6 of CLAUDE.md.
 *
 * Central authority for all state transition validation.
 * No I/O. No imports from infrastructure or application layers.
 */
import { ConflictError } from '@/shared/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowVariant = 'STANDARD_APPROVAL' | 'DIRECT_ASSIGNMENT';

export type TicketStatus =
  | 'DRAFT'              // Variant 1 only — ticket saved but not yet submitted
  | 'SUBMITTED'          // Variant 1 — awaiting approver action
  | 'APPROVED'           // Variant 1 — approved, awaiting crew assignment
  | 'REJECTED'           // Variant 1 — rejected; rejection_reason required
  | 'ASSIGNED'           // Both variants — crew assigned
  | 'IN_PROGRESS'        // Both variants — work underway
  | 'PENDING_FIELD_VALIDATION' // IM reported inability; assigned PC or Survey Lead reviews
  | 'RETURNED_FOR_CORRECTION'  // Requester revises the same SWR and resubmits
  | 'PENDING_PC_APPROVAL' // Both variants — IM submitted field status; pending approval
  | 'DELAYED'            // Both variants — blocked in field
  | 'COMPLETED'          // Both variants — terminal success state
  | 'REQUESTER_CANCELED' // Terminal cancellation — requester self-cancel
  | 'FIELD_CANCELED'     // Terminal cancellation — field cancel approved
  | 'SURVEY_CANCELED';   // Terminal cancellation — survey-side cancel

// ---------------------------------------------------------------------------
// Permitted transitions per variant
// ---------------------------------------------------------------------------

/**
 * Variant 1 — Standard Approval
 * DRAFT → SUBMITTED → APPROVED → ASSIGNED → IN_PROGRESS → PENDING_PC_APPROVAL → COMPLETED
 *                   ↘ REJECTED
 * PENDING_PC_APPROVAL → IN_PROGRESS | DELAYED | FIELD_CANCELED | COMPLETED
 * DELAYED → IN_PROGRESS | PENDING_PC_APPROVAL
 * Active statuses → REQUESTER_CANCELED | SURVEY_CANCELED
 * REJECTED → APPROVED  (SURVEY_MANAGER only — rejection_overridden; handled at application layer)
 */
const STANDARD_APPROVAL_TRANSITIONS: ReadonlyMap<TicketStatus, ReadonlySet<TicketStatus>> =
  new Map([
    ['DRAFT',            new Set<TicketStatus>(['SUBMITTED', 'REQUESTER_CANCELED'])],
    ['SUBMITTED',        new Set<TicketStatus>(['APPROVED', 'REJECTED', 'RETURNED_FOR_CORRECTION', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['APPROVED',         new Set<TicketStatus>(['ASSIGNED', 'RETURNED_FOR_CORRECTION', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['REJECTED',         new Set<TicketStatus>(['APPROVED', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['ASSIGNED',         new Set<TicketStatus>(['IN_PROGRESS', 'RETURNED_FOR_CORRECTION', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['IN_PROGRESS',      new Set<TicketStatus>(['COMPLETED', 'DELAYED', 'PENDING_FIELD_VALIDATION', 'RETURNED_FOR_CORRECTION', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['PENDING_FIELD_VALIDATION', new Set<TicketStatus>(['RETURNED_FOR_CORRECTION', 'IN_PROGRESS', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['RETURNED_FOR_CORRECTION', new Set<TicketStatus>(['SUBMITTED', 'REQUESTER_CANCELED'])],
    ['PENDING_PC_APPROVAL', new Set<TicketStatus>([
      'COMPLETED',
      'IN_PROGRESS',
      'DELAYED',
      'FIELD_CANCELED',
      'REQUESTER_CANCELED',
      'SURVEY_CANCELED',
    ])],
    ['DELAYED',          new Set<TicketStatus>([
      'IN_PROGRESS',
      'PENDING_FIELD_VALIDATION',
      'RETURNED_FOR_CORRECTION',
      'PENDING_PC_APPROVAL',
      'REQUESTER_CANCELED',
      'SURVEY_CANCELED',
    ])],
  ]);

/**
 * Variant 2 — Direct Assignment
 * ASSIGNED → IN_PROGRESS → PENDING_PC_APPROVAL → COMPLETED
 * PENDING_PC_APPROVAL → IN_PROGRESS | DELAYED | FIELD_CANCELED | COMPLETED
 * DELAYED → IN_PROGRESS | PENDING_PC_APPROVAL
 * Active statuses → REQUESTER_CANCELED | SURVEY_CANCELED
 */
const DIRECT_ASSIGNMENT_TRANSITIONS: ReadonlyMap<TicketStatus, ReadonlySet<TicketStatus>> =
  new Map([
    ['ASSIGNED',         new Set<TicketStatus>(['IN_PROGRESS', 'RETURNED_FOR_CORRECTION', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['IN_PROGRESS',      new Set<TicketStatus>(['COMPLETED', 'DELAYED', 'PENDING_FIELD_VALIDATION', 'RETURNED_FOR_CORRECTION', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['PENDING_FIELD_VALIDATION', new Set<TicketStatus>(['RETURNED_FOR_CORRECTION', 'IN_PROGRESS', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['RETURNED_FOR_CORRECTION', new Set<TicketStatus>(['SUBMITTED', 'REQUESTER_CANCELED'])],
    ['PENDING_PC_APPROVAL', new Set<TicketStatus>([
      'COMPLETED',
      'IN_PROGRESS',
      'DELAYED',
      'FIELD_CANCELED',
      'REQUESTER_CANCELED',
      'SURVEY_CANCELED',
    ])],
    ['DELAYED',          new Set<TicketStatus>([
      'IN_PROGRESS',
      'PENDING_FIELD_VALIDATION',
      'RETURNED_FOR_CORRECTION',
      'PENDING_PC_APPROVAL',
      'REQUESTER_CANCELED',
      'SURVEY_CANCELED',
    ])],
  ]);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates that transitioning from `from` to `to` is legal for the given variant.
 * Throws ConflictError immediately on invalid transition — no silent failures.
 */
export function assertValidTransition(
  variant: WorkflowVariant,
  from: TicketStatus,
  to: TicketStatus,
): void {
  const map =
    variant === 'STANDARD_APPROVAL'
      ? STANDARD_APPROVAL_TRANSITIONS
      : DIRECT_ASSIGNMENT_TRANSITIONS;

  const permitted = map.get(from);

  if (!permitted || !permitted.has(to)) {
    throw new ConflictError(
      `Cannot transition from ${from} to ${to} in variant ${variant}`,
    );
  }
}
