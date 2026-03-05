# SKILL: Coding Conventions

> Paste this into a Claude Code session to establish baseline coding standards
> without re-briefing from scratch. Use alongside CLAUDE.md, not instead of it.

---

## Stack

TypeScript + Node.js backend, Next.js frontend, PostgreSQL, Railway.
No Redis. No external queues. No new services without project owner approval.

---

## The Non-Negotiables

**One correct path.** No fallback branches. If the primary mechanism fails, throw — don't try something else.

**Fail fast.** Validate at trust boundaries (HTTP handlers, job ingestion). Throw immediately when a precondition is not met. No silent failures.

**Smallest possible diff.** Do not refactor nearby code unless it directly blocks the fix. No drive-by formatting changes.

**No cross-layer leakage:**
- Domain: pure business logic, no I/O, fully deterministic. Zero imports from infrastructure.
- Application: orchestration, permissions, transitions. No DB calls directly — go through infrastructure interfaces.
- Infrastructure: DB, file storage, email. Implements interfaces defined in application layer.
- Web/API: routing, auth middleware, request/response mapping only. Zero business logic.

---

## TypeScript Conventions

Prefer compile-time correctness over defensive runtime checks.

```typescript
// ✅ Use discriminated unions for state
type TicketStatus =
  | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  | 'ASSIGNED' | 'IN_PROGRESS' | 'PENDING_PC_APPROVAL'
  | 'DELAYED' | 'COMPLETED'
  | 'REQUESTER_CANCELED' | 'FIELD_CANCELED' | 'SURVEY_CANCELED';

// ✅ Explicit return types on all exported functions
export function validateTransition(
  from: TicketStatus,
  to: TicketStatus,
  actor: ProjectRole
): void { ... }

// ❌ Never use `any` — use `unknown` and narrow it
// ❌ Never use non-null assertion (!) — handle nulls explicitly
// ❌ Never use optional chaining to silently skip missing data at trust boundaries
```

Runtime validation is allowed **only at trust boundaries**:
- HTTP request bodies (use zod or equivalent)
- External job payloads
- File upload metadata

Do not re-validate the same field in deeper layers.

---

## Prohibited Patterns

```typescript
// ❌ Fallback branch
const result = await primaryMethod().catch(() => fallbackMethod());

// ❌ Silent null return instead of throwing
function findTicket(id: string) {
  const ticket = db.find(id);
  if (!ticket) return null; // ← wrong at application layer; throw NotFoundError
}

// ❌ Status derived from multiple booleans
const isActive = !ticket.canceled && !ticket.completed && ticket.submitted;

// ❌ Business logic in route handler
app.post('/tickets/:id/approve', async (req, res) => {
  const ticket = await db.findTicket(req.params.id);
  if (ticket.status !== 'SUBMITTED') throw new Error('...');
  ticket.status = 'APPROVED'; // ← wrong layer
  await db.save(ticket);
});

// ❌ Domain importing infrastructure
// src/modules/ticket/domain/ticket.ts
import { db } from '@/infrastructure/db'; // ← never

// ✅ Domain stays pure
// src/modules/ticket/domain/transitions.ts
export function assertValidTransition(from: TicketStatus, to: TicketStatus): void {
  const allowed = TRANSITION_MAP[from];
  if (!allowed?.includes(to)) {
    throw new ConflictError(`Cannot transition from ${from} to ${to}`);
  }
}
```

---

## Error Taxonomy

Use only these error types. Import from `src/lib/errors.ts`.

| Class | When |
|---|---|
| `ValidationError` | Bad input at trust boundary |
| `UnauthorizedError` | Not authenticated |
| `ForbiddenError` | Authenticated but lacks permission |
| `NotFoundError` | Resource doesn't exist within tenant scope |
| `ConflictError` | Invalid state transition or concurrency conflict |
| `InternalError` | Unexpected failure |

All errors produce this JSON shape — the HTTP layer maps error class to status code:

```json
{ "error": { "type": "ConflictError", "message": "Cannot approve a ticket in DRAFT status" } }
```

Error messages must be **actionable**: say what was wrong and where, not just "invalid request."

---

## Database Conventions

Every query that returns tenant-scoped data **must** include `tenant_id` in the WHERE clause. No exceptions.

```typescript
// ✅ Always scoped
const ticket = await db.query(
  'SELECT * FROM tickets WHERE id = $1 AND tenant_id = $2',
  [ticketId, tenantId]
);

// ❌ Missing tenant scope — never
const ticket = await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
```

Soft-deletes only for drafts. Never hard-delete a draft ticket.

AOR tree traversal must use recursive CTEs — never traverse the tree in application code.

---

## Audit Events

Every state transition emits a corresponding audit event **in the same DB transaction**. The event write and the state change are atomic — if either fails, both roll back.

Event names come from CLAUDE.md Section 12. Never invent a new event name without updating CLAUDE.md first.

```typescript
// ✅ Correct — both in same transaction
await db.transaction(async (trx) => {
  await trx.query('UPDATE tickets SET status = $1 WHERE id = $2', ['APPROVED', ticketId]);
  await trx.query(
    'INSERT INTO ticket_events (ticket_id, tenant_id, actor_id, event_type, payload) VALUES ($1,$2,$3,$4,$5)',
    [ticketId, tenantId, actorId, 'ticket.approved', JSON.stringify({ reason })]
  );
});
```

`ticket_events` is append-only. No UPDATE. No DELETE. Ever.

---

## Logging

Structured only. Log at boundaries and state transitions. Do not log sensitive data.

```typescript
// ✅
logger.info({ event: 'ticket.approved', ticketId, tenantId, actorId });

// ❌ Unstructured
console.log('ticket approved: ' + ticketId);

// ❌ Sensitive data
logger.info({ event: 'user.login', password: req.body.password });
```

---

## Output Format for Every Agent Session

1. **Summary** (1–3 bullets of what changed)
2. **Files changed** (exact paths)
3. **Why this is the smallest correct fix**
4. **How to test** (`pnpm test` commands + expected results)
5. **Risks / follow-ups** (only if real)
