# SKILL: Workflow State Machine and Domain Invariants

> Load this skill when working on anything touching ticket state transitions,
> cancellation paths, the 48-hour rule, priority logic, crew assignment, or help flags.
> Use alongside CLAUDE.md Section 6, not instead of it.

---

## The Single Transition Function Rule

All state transitions are validated in **one central function** in the Workflow module.
No transition logic lives anywhere else — not in use-cases, not in route handlers, not in the DB layer.

If you're adding a transition: add it to the central transition map, not inline.

```typescript
// src/modules/workflow/domain/transitions.ts

const TRANSITION_MAP: Record<TicketStatus, TicketStatus[]> = {
  DRAFT:                  ['SUBMITTED'],
  SUBMITTED:              ['APPROVED', 'REJECTED'],
  APPROVED:               ['ASSIGNED'],
  REJECTED:               ['APPROVED'],              // override path — APPROVER only
  ASSIGNED:               ['IN_PROGRESS', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'],
  IN_PROGRESS:            ['PENDING_PC_APPROVAL', 'REQUESTER_CANCELED', 'SURVEY_CANCELED'],
  PENDING_PC_APPROVAL:    ['COMPLETED', 'IN_PROGRESS', 'DELAYED', 'FIELD_CANCELED'],
  DELAYED:                ['IN_PROGRESS', 'PENDING_PC_APPROVAL'],
  COMPLETED:              [],   // terminal — no exits
  REQUESTER_CANCELED:     [],   // terminal — no exits
  FIELD_CANCELED:         [],   // terminal — no exits
  SURVEY_CANCELED:        [],   // terminal — no exits
};

export function assertValidTransition(from: TicketStatus, to: TicketStatus): void {
  const allowed = TRANSITION_MAP[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ConflictError(`Cannot transition from ${from} to ${to}`);
  }
}
```

---

## Status Enum — Complete and Exact

```
DRAFT
SUBMITTED
APPROVED
REJECTED
ASSIGNED
IN_PROGRESS
PENDING_PC_APPROVAL
DELAYED
COMPLETED
REQUESTER_CANCELED
FIELD_CANCELED
SURVEY_CANCELED
```

No `CLOSED`. No `CANCEL_REQUESTED`. No `CANCEL_APPROVED`. Those are retired — do not add them back.

Terminal states (no further transitions): `COMPLETED`, `REQUESTER_CANCELED`, `FIELD_CANCELED`, `SURVEY_CANCELED`.

"Active status" for cancellation purposes = any status except the four terminal states AND `DRAFT`.
Drafts are not active — cancellations don't apply to drafts. Requesters delete drafts directly.

---

## Workflow Variants

**Variant 1 — Standard Approval** (used for planned survey work)
- Starts at `DRAFT`
- `ticket_number` assigned at `DRAFT → SUBMITTED` (not at draft creation)
- 48-hour minimum notice enforced at `DRAFT → SUBMITTED` — hard domain rule, not configurable
- `REJECTED` requires `rejection_reason` before transition completes

**Variant 2 — Direct Assignment** (urgent or pre-authorized work)
- Starts at `ASSIGNED` (no DRAFT, no SUBMITTED, no approval gate)
- Survey Manager or Superintendent assigns crew immediately

---

## The 48-Hour Rule

```typescript
// src/modules/ticket/domain/rules.ts

export function assert48HourNotice(requestedDate: Date, submittedAt: Date): void {
  const hoursNotice = (requestedDate.getTime() - submittedAt.getTime()) / (1000 * 60 * 60);
  if (hoursNotice < 48) {
    throw new ValidationError(
      `Requested date must be at least 48 hours from submission time. ` +
      `Got ${hoursNotice.toFixed(1)} hours.`
    );
  }
}
```

- Clock starts at submit time — not draft creation time.
- If a requester saved a valid draft date but waits too long to submit, the submission rejects.
- They must update `requested_date` before resubmitting.
- This rule is in the domain layer. It is not a configuration setting.

---

## Cancellation Paths — Four Distinct Paths

Cancellations are **permanent and immutable**. No un-cancel. All paths produce an audit event.

### Path A — Requester-Initiated → `REQUESTER_CANCELED`
- Actor: `REQUESTER` (ticket owner only)
- Trigger: any active status
- Approval: none — immediate
- Audit: `ticket.requester_canceled`
- Notifications: survey team notified

### Path B — Field-Initiated → `FIELD_CANCELED`
- Actor initiates: `INSTRUMENT_MAN`
- Trigger: `IN_PROGRESS` or `DELAYED` only (not earlier statuses)
- Intermediate state: ticket enters `PENDING_PC_APPROVAL`
- Approval chain (first responder wins — no sequential waiting):
  1. Assigned Party Chief
  2. That Party Chief's Survey Superintendent
  3. Survey Manager
- Audit: `ticket.field_cancel_requested` (at initiation) + `ticket.field_canceled` (at approval)
- `cancel_reason` optional; `cancel_initiated_by` and `cancel_approved_by` both recorded

### Path C — Survey-Side → `SURVEY_CANCELED`
- Actor initiates: Party Chief, Survey Superintendent, or Survey Manager
- Trigger: any active status
- `cancel_reason` **required** — this is the paper trail
- Approval chain:
  - Party Chief initiates → Superintendent OR Survey Manager approves
  - Superintendent initiates → Survey Manager approves
  - Survey Manager initiates → immediate, no approval required
- If ticket is `IN_PROGRESS` at time of Path C initiation: Instrument Man notified to stop work
- Audit: `ticket.survey_cancel_requested` + `ticket.survey_canceled` + (if IN_PROGRESS) `ticket.im_stop_work_notified`

### Path D — RETIRED
Do not implement `CANCEL_REQUESTED`, `CANCEL_APPROVED`, or `CANCEL_REJECTED`. These are removed.

---

## REJECTED → APPROVED Override

This is a permitted non-standard transition. Available to `APPROVER` role only.
Written reason required before transition completes.
Audit: `ticket.rejection_overridden`.

```typescript
// Use-case must check:
assertRole(actor, 'APPROVER');
assertValidTransition('REJECTED', 'APPROVED');
if (!reason?.trim()) throw new ValidationError('Written reason required for rejection override');
```

---

## PENDING_PC_APPROVAL Detail

When an Instrument Man submits a field status (COMPLETED, DELAYED, or field cancel initiation),
ticket enters `PENDING_PC_APPROVAL`. A Party Chief (or override actor) must act before status finalizes.

| IM submits | Party Chief approves | Party Chief rejects |
|---|---|---|
| Completion | → `COMPLETED` | → `IN_PROGRESS` (reason optional; IM notified) |
| Delayed status | → `DELAYED` (reason captured at IM initiation) | — |
| Field cancel | → `FIELD_CANCELED` | — |

**Override:** If Party Chief is unreachable, Superintendent or Survey Manager may act.
Audit: `ticket.pc_approval_overridden`. Party Chief notified.

---

## Priority System

Priority is set by the system — requesters cannot set it directly.

**At submission:**
1. Check `priority_whitelist` — if requester email matches, set `HIGH` regardless of title.
   Audit: `ticket.priority_set_by_whitelist`
2. Otherwise, use `discipline_titles.default_priority` for the submitter's title.
   Audit: `ticket.priority_set_by_title`
3. If no title assigned: `NORMAL`.

**Post-submission:**
- `SURVEY_MANAGER` or `APPROVER` may elevate. Reason required.
  Audit: `ticket.priority_elevated`
- `SURVEY_MANAGER` may lower. Lowering a `HIGH` ticket requires UI confirmation prompt.
  Audit: `ticket.priority_downgrade_confirmed` (reason required)

Priority does not bypass the approval workflow. It is an operational signal only.

---

## Ticket Numbering

- Internal ID: UUID — used in DB and all API calls. Never shown to users.
- Human-readable: `FSS-[NODE_CODE]-[ZERO_PADDED_SEQUENCE]` e.g. `FSS-U1-00247`
- `NODE_CODE` = `aor_nodes.code` for the ticket's AOR node
- Sequence is per-project, increments on every ticket creation regardless of status
- Assigned at `DRAFT → SUBMITTED` transition — drafts have no ticket_number
- Immutable once assigned — rejected and canceled tickets keep their number
- Resubmissions after rejection get a new number + `parent_ticket_id` pointing to the rejected ticket

---

## Subcontractor Isolation (Second Filter Rule)

Subcontractor users get role scoping PLUS a second company filter:

```typescript
// Applied at data access layer, always
if (user.company.type === 'SUBCONTRACTOR') {
  query = query.andWhere('tickets.company_id = :companyId', { companyId: user.companyId });
}
```

This is a second filter on top of role scoping — not instead of it.
A `VIEWER` who is a subcontractor employee still only sees their company's tickets.

---

## Draft Invariants

- `ticket_number` is null on all drafts. Never assign before `DRAFT → SUBMITTED`.
- Drafts are soft-deleted only. Never hard-delete.
- Auto-expiry: background job soft-deletes drafts where `draft_last_saved_at < now() - 7 days`.
- Soft-delete sets `draft_deleted_at = now()` and `draft_deleted_reason`.
- All draft queries must filter `draft_deleted_at IS NULL` unless actor is `TENANT_ADMIN` doing recovery.
- `TENANT_ADMIN` can recover a soft-deleted draft. Audit: `ticket.draft_recovered`.

---

## AOR Tree Traversal

AOR visibility queries must use recursive CTEs. Never traverse the tree in application code.

```sql
-- Template for "user sees tickets at their AOR node and all descendants"
WITH RECURSIVE aor_subtree AS (
  SELECT id FROM aor_nodes WHERE id = $1  -- user's assigned node
  UNION ALL
  SELECT n.id FROM aor_nodes n
  JOIN aor_subtree a ON n.parent_id = a.id
)
SELECT t.* FROM tickets t
WHERE t.aor_node_id IN (SELECT id FROM aor_subtree)
  AND t.tenant_id = $2;
```
