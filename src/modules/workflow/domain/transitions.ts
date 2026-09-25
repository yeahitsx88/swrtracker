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
  | 'PENDING_PC_APPROVAL' // Instrument Man report awaiting field lead approval
  | 'DELAYED'
  | 'FIELD_CANCELED'
  | 'COMPLETED'          // Both variants — terminal success state
  | 'REQUESTER_CANCELED' // Requester self-cancellation (current Path A)
  | 'SURVEY_CANCELED';   // Survey-side cancellation (current Path C)

// ---------------------------------------------------------------------------
// Permitted transitions per variant
// ---------------------------------------------------------------------------

/**
 * Variant 1 — Standard Approval
 * DRAFT → SUBMITTED → APPROVED → ASSIGNED → IN_PROGRESS
 *                   ↘ REJECTED                         → PENDING_PC_APPROVAL → COMPLETED
 * REJECTED → APPROVED is restricted to SURVEY_MANAGER in the use case.
 * Active tickets may be requester-canceled.
 */
const STANDARD_APPROVAL_TRANSITIONS: ReadonlyMap<TicketStatus, ReadonlySet<TicketStatus>> =
  new Map([
    ['DRAFT',            new Set<TicketStatus>(['SUBMITTED'])],
    ['SUBMITTED',        new Set<TicketStatus>(['APPROVED', 'REJECTED', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['APPROVED',         new Set<TicketStatus>(['ASSIGNED', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['REJECTED',         new Set<TicketStatus>(['APPROVED', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['ASSIGNED',         new Set<TicketStatus>(['IN_PROGRESS', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['IN_PROGRESS',      new Set<TicketStatus>(['PENDING_PC_APPROVAL', 'COMPLETED', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['PENDING_PC_APPROVAL', new Set<TicketStatus>(['COMPLETED', 'DELAYED', 'FIELD_CANCELED', 'IN_PROGRESS', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['DELAYED',          new Set<TicketStatus>(['IN_PROGRESS', 'PENDING_PC_APPROVAL', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
  ]);

/**
 * Variant 2 — Direct Assignment
 * CREATED → ASSIGNED → IN_PROGRESS → PENDING_PC_APPROVAL → COMPLETED
 * Active tickets may be requester-canceled. Direct completion from IN_PROGRESS
 * is permitted only when no Instrument Man is assigned, enforced by the use case.
 */
const DIRECT_ASSIGNMENT_TRANSITIONS: ReadonlyMap<TicketStatus, ReadonlySet<TicketStatus>> =
  new Map([
    ['CREATED',          new Set<TicketStatus>(['ASSIGNED', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['ASSIGNED',         new Set<TicketStatus>(['IN_PROGRESS', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['IN_PROGRESS',      new Set<TicketStatus>(['PENDING_PC_APPROVAL', 'COMPLETED', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['PENDING_PC_APPROVAL', new Set<TicketStatus>(['COMPLETED', 'DELAYED', 'FIELD_CANCELED', 'IN_PROGRESS', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
    ['DELAYED',          new Set<TicketStatus>(['IN_PROGRESS', 'PENDING_PC_APPROVAL', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'])],
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
