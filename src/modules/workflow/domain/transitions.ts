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
  | 'CREATED'            // Variant 2 only — equivalent of submitted
  | 'ASSIGNED'           // Both variants — crew assigned
  | 'IN_PROGRESS'        // Both variants — work underway
  | 'COMPLETED'          // Both variants — work done; awaiting Survey Lead close-out
  | 'CLOSED'             // Both variants — terminal state; performed by SURVEY_LEAD
  | 'CANCEL_REQUESTED'   // Both variants — cancellation initiated
  | 'CANCEL_APPROVED'    // Both variants — cancellation confirmed
  | 'CANCEL_REJECTED';   // Both variants — cancellation denied

// ---------------------------------------------------------------------------
// Permitted transitions per variant
// ---------------------------------------------------------------------------

/**
 * Variant 1 — Standard Approval
 * DRAFT → SUBMITTED → APPROVED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
 *                   ↘ REJECTED
 * ASSIGNED/IN_PROGRESS → CANCEL_REQUESTED → CANCEL_APPROVED
 *                                         → CANCEL_REJECTED
 * REJECTED → APPROVED  (APPROVER only — rejection_overridden; handled at application layer)
 * COMPLETED → CLOSED   (SURVEY_LEAD only — enforced at application layer)
 */
const STANDARD_APPROVAL_TRANSITIONS: ReadonlyMap<TicketStatus, ReadonlySet<TicketStatus>> =
  new Map([
    ['DRAFT',            new Set<TicketStatus>(['SUBMITTED'])],
    ['SUBMITTED',        new Set<TicketStatus>(['APPROVED', 'REJECTED'])],
    ['APPROVED',         new Set<TicketStatus>(['ASSIGNED'])],
    ['REJECTED',         new Set<TicketStatus>(['APPROVED'])],  // rejection_overridden path
    ['ASSIGNED',         new Set<TicketStatus>(['IN_PROGRESS', 'CANCEL_REQUESTED'])],
    ['IN_PROGRESS',      new Set<TicketStatus>(['COMPLETED', 'CANCEL_REQUESTED'])],
    ['COMPLETED',        new Set<TicketStatus>(['CLOSED'])],
    ['CANCEL_REQUESTED', new Set<TicketStatus>(['CANCEL_APPROVED', 'CANCEL_REJECTED'])],
  ]);

/**
 * Variant 2 — Direct Assignment
 * CREATED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED
 * ASSIGNED/IN_PROGRESS → CANCEL_REQUESTED → CANCEL_APPROVED
 *                                         → CANCEL_REJECTED
 * COMPLETED → CLOSED   (SURVEY_LEAD only — enforced at application layer)
 */
const DIRECT_ASSIGNMENT_TRANSITIONS: ReadonlyMap<TicketStatus, ReadonlySet<TicketStatus>> =
  new Map([
    ['CREATED',          new Set<TicketStatus>(['ASSIGNED'])],
    ['ASSIGNED',         new Set<TicketStatus>(['IN_PROGRESS', 'CANCEL_REQUESTED'])],
    ['IN_PROGRESS',      new Set<TicketStatus>(['COMPLETED', 'CANCEL_REQUESTED'])],
    ['COMPLETED',        new Set<TicketStatus>(['CLOSED'])],
    ['CANCEL_REQUESTED', new Set<TicketStatus>(['CANCEL_APPROVED', 'CANCEL_REJECTED'])],
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
