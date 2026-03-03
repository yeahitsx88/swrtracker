# AGENTS.md — Claude Code Agent Coordination

> This file defines safe parallelization boundaries, agent roles, and coordination
> rules for AI-assisted development on swrtracker.
>
> Read CLAUDE.md in full before acting. This file is the coordination layer on top of it.
> When CLAUDE.md and AGENTS.md conflict, CLAUDE.md wins.

---

## 1. Before You Do Anything

1. Read `CLAUDE.md` completely.
2. Read the relevant section of `CLAUDE.md` for your assigned module (see Section 3 below).
3. Run `pnpm tsc --noEmit` and `pnpm test` before touching anything. Record the baseline.
4. Make the smallest possible diff. Do not refactor nearby code.
5. After your change: `pnpm tsc --noEmit` must pass. `pnpm test` must pass or improve.
6. Record your work in `CODEX.md` using the existing batch format.

---

## 2. Agent Roles

Three agent archetypes are used on this project. Each session should declare which role it is operating in.

### IMPLEMENTER
Writes production code (use-cases, migrations, API routes, domain logic).
- Operates within one module at a time.
- Must not touch files outside its assigned module boundary (see Section 3).
- Exception: may write to `db/migrations/` and `tests/` for changes directly tied to its module.

### AUDITOR
Compares spec (CLAUDE.md) against implementation. Produces a gap report only — does not write production code.
- Reads: `CLAUDE.md`, `src/`, `db/migrations/`, `tests/`.
- Writes: a markdown gap report in `audits/` (create the directory if absent).
- Never modifies production code or tests.

### TEST_WRITER
Adds missing test coverage for existing, already-merged behavior.
- Works from the test matrix in Section 5 of this file.
- Does not change production code.
- May modify `tests/setup/fixtures.ts` to add missing fixtures.
- One test file per module per session.

---

## 3. Module Ownership and Safe Parallelization Boundaries

Each module maps to a directory. Agents working different modules in parallel must not touch each other's directories.

| Module | Owned Paths | CLAUDE.md Reference |
|---|---|---|
| **Identity** | `src/modules/identity/` | Sections 8, 7 |
| **Tenancy** | `src/modules/tenancy/` | Sections 5, 7, 7A |
| **Ticket** | `src/modules/ticket/` | Sections 5, 6, 4 |
| **Workflow** | `src/modules/workflow/` | Section 6 |
| **Attachment** | `src/modules/attachment/` | Section 5 (attachments table), Section 4 (Attachment Permissions) |
| **Notification** | `src/modules/notification/` | Sections 12 (audit events that trigger notifications) |
| **Reporting** | `src/modules/reporting/` | Section 2 (locked tech stack), PROJECT_VISION_v2.md Reporting section |
| **Audit** | `src/modules/audit/` | Section 12 |

### Shared paths — coordinate before touching

The following paths are shared infrastructure. Two agents must not write to the same file simultaneously. Claim it in your task description before starting.

| Path | Who can write |
|---|---|
| `db/migrations/` | IMPLEMENTER only; one migration per agent session; number sequentially |
| `src/lib/` | Any agent; coordinate on specific filenames |
| `tests/setup/fixtures.ts` | TEST_WRITER or IMPLEMENTER when adding new entity types |
| `src/app/api/` | IMPLEMENTER only; one route file per agent session |
| `CODEX.md` | Append only; never rewrite existing entries |

### Cross-module imports — what is allowed

```
✅ src/modules/ticket/ may import from src/modules/audit/ (emit events)
✅ src/modules/workflow/ may import from src/modules/ticket/ (read state)
✅ src/modules/notification/ may import from src/modules/audit/ (subscribe to events)
✅ Any module may import from src/lib/ (shared utilities, error types)

❌ src/modules/identity/ must not import from src/modules/ticket/
❌ Domain layer must never import from Infrastructure layer
❌ Web layer must never contain business logic
❌ No circular module dependencies
```

---

## 4. Parallelization Playbook

### Safe to run in parallel (no shared file writes)

These module pairs can be worked simultaneously without coordination:

- Identity + Reporting
- Attachment + Notification
- Audit + Tenancy (if Tenancy agent does not touch `src/lib/get-tenant-role.ts`)
- Ticket + Reporting (if Ticket agent does not touch reporting queries)

### Requires sequencing (shared file writes)

- **Migrations**: always sequential. One agent writes one migration. The next agent's migration must have a higher number. Check `db/migrations/` before starting.
- **Fixtures**: coordinate before both agents touch `tests/setup/fixtures.ts` in the same session.
- **Role enum changes**: serialize all role enum modifications through a single agent session.
- **Status enum changes**: serialize all ticket status enum modifications through a single agent session.

### Conflict resolution rule

If two agents need the same file:
1. The agent that opened the file first owns it for that session.
2. The second agent must wait or work around it.
3. If the wait is >1 session, escalate to the project owner.

---

## 5. Test Matrix (Required Coverage)

Every workflow use-case must have tests covering all six of the following. TEST_WRITER agents use this as their checklist.

| # | Scenario | Required |
|---|---|---|
| 1 | Happy path | ✅ Always |
| 2 | Invalid state transition | ✅ Always |
| 3 | Unauthorized actor (wrong role) | ✅ Always |
| 4 | Tenant isolation (different tenant cannot see/act) | ✅ Always |
| 5 | Visibility scoping (correct role sees correct tickets, nothing more) | ✅ Always |
| 6 | Cancellation path correctness (correct terminal state, correct approver chain) | ✅ When cancellation is involved |

Tests live in `tests/<module>/`. Mirror the module structure.

---

## 6. Audit Event Rule (Non-Negotiable)

Every state transition must emit a corresponding audit event **in the same database transaction**.

The event must be written to `ticket_events` (append-only) before the transaction commits.
If the event write fails, the transaction must roll back — the state change and the audit event are atomic.

Audit event names are defined in CLAUDE.md Section 12. Do not invent new event names. If you need a new event, add it to CLAUDE.md Section 12 first and flag it in your CODEX.md entry.

---

## 7. Migration Rules

- One migration file per agent session. Never split a logical change across two files.
- Filename format: `NNN_description.sql` where NNN is the next sequential number.
- Check `db/migrations/` before picking a number.
- Migrations must be idempotent where possible (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
- Never drop a column without explicit instruction from the project owner.
- Every migration must have a corresponding entry in CODEX.md.

---

## 8. Definition of Done (Agent Session)

A session is complete only when all of the following are true:

- [ ] `pnpm tsc --noEmit` passes with zero errors
- [ ] `pnpm test` passes (no regressions; new tests added for new behavior)
- [ ] No cross-layer leakage (domain free of I/O, web free of business logic)
- [ ] Every state transition emits its audit event in the same transaction
- [ ] CODEX.md updated with a new batch entry (intent, files touched, behavior added/changed, known gaps)
- [ ] No files outside the module boundary were modified (or deviation is documented)

---

## 9. What Agents Must Never Do

- Add configuration surfaces, admin panels, or rule builders (CLAUDE.md Section 15)
- Implement SSO (deferred — schema is already future-proofed)
- Add Redis, message queues, or external integrations not in the locked stack
- Add fallback branches ("if X fails then Y")
- Write silent failures (swallow errors, return null instead of throwing)
- Modify `ticket_events` rows after insert (append-only, ever)
- Hard-delete drafts (soft-delete only via `draft_deleted_at`)
- Assign `ticket_number` before the `DRAFT → SUBMITTED` transition
- Allow domain layer to import from infrastructure
- Skip the tenant_id scope on any query returning domain data

---

## 10. First Agent Task — Validation Smoke Test

Run this task to verify your agent setup is working correctly end-to-end.

**Task: Subcontractor Isolation Enforcement (known gap from CODEX.md Batch 1)**

> CODEX.md Batch 1 records: "subcontractor company isolation is not yet enforced in ticket repository queries"

**Scope:** `src/modules/ticket/` + `tests/ticket/`

**Steps:**

1. Locate the ticket list/query function in `src/modules/ticket/infrastructure/` (likely a repository).
2. Add a second filter: when the querying user's `company.type = SUBCONTRACTOR`, scope results to `company_id = user.company_id`.
3. This filter is applied **on top of** role scoping, not instead of it.
4. Add or update the test in `tests/ticket/visibility.test.ts`:
   - Subcontractor user sees only their company's tickets
   - Subcontractor user cannot see another subcontractor company's tickets
   - GC user with same role sees all tickets (isolation does not apply)
5. `pnpm tsc --noEmit` must pass.
6. `pnpm test` must pass.
7. Append to CODEX.md: Batch 3 entry.

**Expected CODEX.md entry format:**
```
### YYYY-MM-DD - Batch 3
- Intent: enforce subcontractor company isolation in ticket repository queries (gap from Batch 1)
- Files touched: [list]
- Behavior added: subcontractor users filtered to own company_id at data access layer
- Known gap queued for later batches: [any new gaps discovered]
- Production behavior changed: yes
```

This task touches exactly one module, has clear before/after state, has a pre-existing test file to extend, and closes a documented gap — making it ideal for validating that your agent reads specs, makes surgical changes, and updates CODEX.md correctly.
