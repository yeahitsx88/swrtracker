# SWRTracker Phase 4 Hardening Pipeline

## Intake Notes (Phase A)
- Authoritative sources used for this intake:
  - `SWRTracker_Phase4_Executive_Summary.md`
  - `SWRTracker_Hardening_Roadmap.md`
- Supporting in-repo evidence references used for concrete reproduction context:
  - `CHAOS_REPORT.md`
  - `audits/2026-03-05-group2-saas-stress-audit.md`
  - `PHASE4_STATUS.md`
- Concrete issues extracted for hardening sequence:
  - Cross-tenant membership injection path on project-member writes.
  - Privilege downgrade/session staleness allowing one privileged mutation after demotion.
  - Deactivated users and JWTs not revalidated strongly enough at request time.
  - Concurrency races in workflow transitions (conflicting writes).
  - Missing idempotency controls for duplicate create/assign/cancel mutations.
  - Offboarding orphaned ownership without enforced reassignment timeline.
  - Correlation coverage incomplete for triage-grade diagnostics.
- Success criteria extracted:
  - Zero cross-tenant mutations.
  - Deterministic conflict handling on concurrent lifecycle transitions (409).
  - Retry-safe mutations (no duplicate logical entities).
  - Immediate privilege revocation effectiveness.
  - Orphan work detection + recoverability.
  - End-to-end correlation ID traceability for critical paths.
- Roadmap alignment:
  - Step 1 maps to Roadmap Phase 1 (Days 1-3): security boundary stabilization.
  - Steps 2-4 map to Roadmap Phases 2-4.
  - Step 5 incorporates Roadmap Phases 5 and 6 (observability plus chaos re-certification).

## Global Invariants (Do Not Violate)
- Tenant boundary is absolute: no cross-tenant reads or writes, direct or indirect.
- Privilege revocation must take effect immediately (no wait for token expiry loophole).
- Lifecycle transitions are deterministic: concurrency conflicts yield a clear 409 + recoverability.
- Mutations are idempotent: retries/double submits never create duplicates.
- Errors are structured and actionable (no generic 500 without correlation context).
- Orphaned work is automatically detectable and recoverable.
- All critical paths emit correlation IDs and minimal structured logs.

## Workstream Status
- [x] Step 1 Security Boundary
- [x] Step 2 Concurrency/State Machine
- [x] Step 3 Idempotency/API Reliability
- [x] Step 4 Workflow Integrity/Offboarding
- [x] Step 5 Observability/Chaos Certification

## Step 1 Execution Result (2026-03-05)
- Acceptance gate: PASS
- Validation:
  - `pnpm tsc --noEmit` -> pass
  - `pnpm test` -> pass (`168/168`)
- Implemented scope summary:
  - Cross-tenant project membership mutation checks enforced at use-case and repository layers.
  - Session versioning added (`users.session_version`) and wired into JWT auth context.
  - Immediate revocation enforced on role-checked routes by validating `sessionVersion` + active user state.
  - Tenant/project role changes invalidate existing sessions via session-version bump.
  - Structured API errors now include `code` and `correlationId`.

## Step 1  Security Boundary Engineer  SPEC/HANDOFF (v1.1)
### 1) Problem Statement
- Reported issue(s) addressed:
  - `F-CRIT-01`: cross-tenant project-member injection on membership assignment.
  - `F-CRIT-02`: stale privileged action succeeds shortly after role downgrade.
  - Session hardening gap from stress audit: deactivated users and stale JWTs can remain effective until expiry.
- Why it matters (impact/exploitability):
  - Breaks absolute tenant boundary and can escalate privileges across tenant lines.
  - Violates immediate revocation invariant and enables stale-tab write actions.
  - Weakens offboarding as a security control.
- Minimal reproduction steps:
  - Use tenant A admin session, submit project-member write using tenant B `projectId`/`userId`; mutation must be blocked.
  - Demote a privileged user in admin session, execute stale privileged mutation from existing session/tab; mutation must be blocked immediately.
  - Deactivate user account and replay existing JWT against protected mutation route; mutation must be rejected.
- Source tie-back:
  - Executive summary: "Cross-tenant membership injection vulnerability" and "Delayed privilege revocation after role changes."
  - Hardening roadmap Phase 1 tasks: tenant equality validation, token versioning, automated RBAC regression tests.

### 2) Decision / Design
- Invariants introduced or strengthened:
  - Every privileged write validates actor tenant, target project tenant, and target user tenant in a single authorization flow.
  - Token claims are revocation-aware; role/demotion/deactivation invalidates previously issued tokens immediately.
  - Authorization decisions are evaluated at mutation time, not only token-issuance time.
- Approach selected (and why):
  - Add tenant-integrity assertions in tenancy member-assignment use-case + repository checks (defense-in-depth).
  - Introduce token/session versioning on `users` and embed version in JWT claim; compare on each authenticated request.
  - Enforce active-user check (`deactivated_at IS NULL`) during auth and protected route evaluation.
  - Standardize privileged authorization errors to deterministic 403/401 structured payloads.
- Alternatives rejected (brief):
  - Waiting for short JWT expiry only: rejected, does not satisfy immediate revocation.
  - Route-only tenant checks: rejected, insufficient against internal call-path drift.
  - Best-effort background revocation sync: rejected, nondeterministic timing.

### 3) Contracts / Interfaces
- API changes (endpoints, payloads, status codes):
  - `POST /api/projects/[projectId]/members`
    - Must reject cross-tenant target project/user combinations with `403`.
    - Response code contract: `SEC_TENANT_BOUNDARY_VIOLATION`.
  - All protected mutation endpoints using cookie JWT:
    - Must reject revoked/stale token version or deactivated user with `401`.
    - Response code contract: `AUTH_SESSION_REVOKED`.
- Error model changes (shape + codes):
  - Extend structured error payload with:
    - `code` (machine-readable), `message`, `correlationId`, `details` (optional).
  - New codes in Step 1 scope:
    - `SEC_TENANT_BOUNDARY_VIOLATION`
    - `AUTH_SESSION_REVOKED`
    - `AUTH_USER_DEACTIVATED`
- DB schema changes (tables/columns/indexes/constraints):
  - Add `users.session_version INTEGER NOT NULL DEFAULT 1`.
  - Add index support for active-user auth lookups if needed (`users(tenant_id, id, deactivated_at)` or equivalent selective index).
  - No destructive schema changes.
- Backwards compatibility notes:
  - Existing JWTs without `sessionVersion` claim are treated as revoked after deployment cutover.
  - Requires coordinated deploy: migration first, then app code that reads/writes `session_version`.

### 3A) Contract Notes
- Security boundary contract owner: Engineer 1 (this step).
- Contract freeze for downstream steps:
  - `AUTH_SESSION_REVOKED`, `AUTH_USER_DEACTIVATED`, and `SEC_TENANT_BOUNDARY_VIOLATION` response semantics are locked after Step 1 acceptance.
  - Downstream steps may consume these codes but may not rename/remove them without Contract Revision.
- Stop-the-line trigger:
  - If Step 2+ requires changing Step 1 auth/session/tenant boundary contracts, issue Contract Revision and route back to Step 1 owner before implementation.

### 4) Implementation Plan
- Ordered tasks (small, verifiable increments):
  1. Add migration for `users.session_version` and any supporting index.
  2. Extend identity domain/auth token payload to include `sessionVersion`.
  3. Update auth middleware to load current user auth state (`deactivated_at`, `session_version`) and reject stale/deactivated sessions.
  4. Add use-case-level tenant integrity checks to project-member mutation flow.
  5. Add repository guard helpers to verify project/user tenant alignment before membership write.
  6. Wire structured error codes in affected routes.
  7. Add audit events for blocked security actions (where event contract already exists) without inventing undefined event names.
  8. Ensure roadmap deliverables are produced:
     - tenant validation middleware/guard path
     - token version enforcement
     - security regression test suite
- File targets / modules likely impacted:
  - `src/modules/identity/` (auth/session validation and repository reads)
  - `src/modules/tenancy/application/add-project-member.ts`
  - `src/modules/tenancy/infrastructure/tenancy.repository.ts`
  - `src/app/api/projects/[projectId]/members/route.ts`
  - `src/lib/auth.ts`
  - `src/lib/api-error.ts`
  - `db/migrations/NNN_*.sql`
  - `tests/identity/*`, `tests/tenancy/*`
- Feature flag / migration steps (if any):
  - No feature flag.
  - Deploy order: schema migration -> application rollout -> invalidate old sessions.

### 4A) PR Checklist
- [ ] Tenant equality validation enforced for project membership mutations at route/use-case/repository layers.
- [ ] JWT/session versioning implemented and enforced at request authorization time.
- [ ] Deactivated users are blocked from protected routes and stale sessions.
- [ ] Structured security error codes returned with `correlationId`.
- [ ] Regression tests added for both Phase 4 critical findings.
- [ ] At least 2 edge-case tests added for same failure class.
- [ ] `pnpm tsc --noEmit` passes.
- [ ] `pnpm test` passes.

### 5) Test Plan
MUST INCLUDE:
- Regression tests to reproduce Phase 4 finding(s):
  - Cross-tenant project member assignment attempt is rejected.
  - Privilege-downgraded actor stale session action is rejected immediately.
  - Deactivated user token cannot execute protected mutation.
- At least 2 new edge cases (same failure class):
  - Edge case 1: actor and project share tenant, but target user belongs to foreign tenant -> reject.
  - Edge case 2: stale token with mismatched `sessionVersion` and expired token both produce deterministic `401` structured errors with distinct codes.
- What type: unit/integration/e2e/chaos
  - Unit: auth token verification and tenant-guard helpers.
  - Integration: route + use-case + repository for `/projects/[projectId]/members`.
  - E2E-style API tests: demotion/deactivation revocation path.
- Assertions (expected results):
  - No membership row inserted for rejected security attempts.
  - Error payload includes `code` + `correlationId`.
  - Authorized same-tenant admin path still succeeds.
- Any test data setup requirements:
  - Two tenants, at least one project per tenant, users across both tenants.
  - Fixtures for role downgrade and deactivated user state transitions.

### 6) Observability Proof
- Correlation ID propagation notes:
  - All blocked auth/tenant-boundary requests must emit logs with `correlation_id`, `tenant_id`, `actor_id`, `route`, `error_code`.
- Structured logs/metrics emitted:
  - `security.tenant_boundary_blocked` counter.
  - `auth.session_revoked` counter.
  - `auth.deactivated_user_blocked` counter.
- How to verify in logs:
  - Replay regression tests and assert log entries contain correlation ID and matching error code for each rejected attempt.

### 7) Acceptance Gate (pass/fail)
- Objective pass criteria (explicit):
  - No cross-tenant project-member write is possible through API or use-case path.
  - Privilege revocation is immediate for role downgrade and deactivation.
  - All Step 1 regression + edge-case tests pass.
  - `pnpm tsc --noEmit` and `pnpm test` pass.
- Commands to run (tests, scripts):
  - `pnpm tsc --noEmit`
  - `pnpm test`
  - Targeted tests in `tests/tenancy/` and `tests/identity/` covering Step 1 cases.
- Stop-the-line conditions:
  - Any required contract change that breaks downstream Step 2 assumptions must generate a Contract Revision handoff instead of direct edit.
  - Any change requiring non-listed audit event names must stop for spec update.

### 8) Edge-Case Additions (Non-blocking Backlog)
- Newly discovered edge cases not implemented in this step:
  - P1: normalize unauthorized/not-found ambiguity for tampered resource IDs across all ticket endpoints.
  - P1: tighten open company/tenant bootstrap endpoints with stricter admin-only policy and anti-abuse controls.
  - P2: auth brute-force/rate limiting for login/reset flows.
- Priority (P0/P1/P2) and rationale:
  - P1 items affect security posture but are not required to close Step 1 invariants.
  - P2 is important but tracked for dedicated reliability/security hardening wave.

### 9) Handoff to Next Engineer
- What the next engineer is allowed to implement (scope boundary):
  - After Step 1 implementation is merged and accepted, Step 2 may implement concurrency/state-machine hardening only:
    - optimistic locking/expected-status guards
    - deterministic `409` conflict model
    - transition conflict regression coverage
- What is out-of-scope unless a Contract Revision is issued:
  - Any further auth/session contract changes.
  - Any tenant/RBAC model changes outside transition conflict handling.
  - Any API error-code changes unrelated to conflict semantics.
- Required reading / key invariants to honor:
  - This document Step 1 section.
  - `CHAOS_REPORT.md` findings `F-HIGH-01`, `F-HIGH-02`.
  - `audits/2026-03-05-group2-saas-stress-audit.md` critical issue #2.

## Step 2 Execution Result (2026-03-05)
- Acceptance gate: PASS
- Validation:
  - `pnpm tsc --noEmit` -> pass
  - `pnpm test` -> pass (`172/172`)
- Implemented scope summary:
  - Added optimistic concurrency primitive `tickets.row_version` with migration `017_ticket_row_version_concurrency.sql`.
  - Transition mutations now enforce expected status + expected row version guards in repository updates.
  - Stale writes deterministically fail with `409` semantics via `WORKFLOW_STALE_STATE`.
  - Workflow kernel/shared transition path and direct transition use-cases now pass expected-state guards.
  - Regression and edge-case coverage added for stale-state conflicts and audit atomicity under contention.

## Step 2  Concurrency/State Machine Engineer  SPEC/HANDOFF (v1.0)
### 1) Problem Statement
- Reported issue(s) addressed:
  - `F-HIGH-01`: concurrent approve/reject paths can commit contradictory lifecycle outcomes.
  - `F-HIGH-02`: overlapping transition mutations can produce mismatched downstream effects.
  - Roadmap Phase 2 gaps: stale-tab updates are not deterministically rejected.
- Why it matters (impact/exploitability):
  - Breaks deterministic workflow invariant and causes non-recoverable operator ambiguity.
  - Can produce duplicate/contradictory state transitions under normal multi-tab usage.
- Minimal reproduction steps:
  - Open same ticket in two tabs, execute conflicting transitions within 1-2 seconds.
  - One update should commit; the second must fail as deterministic `409`.

### 2) Decision / Design
- Invariants introduced or strengthened:
  - Transition writes are single-writer deterministic under contention.
  - Every transition mutation applies expected-state guards in persistence layer.
  - Stale state writes fail with structured conflict semantics and recovery guidance.
- Approach selected (and why):
  - Add optimistic concurrency primitive (`row_version`) on `tickets`.
  - Apply `expected_status` + `expected_row_version` guards at update statement level.
  - Keep kernel as single transition chokepoint and pass expected state to repository patch.
  - Return deterministic `409` conflict with explicit machine code and refresh guidance.
- Alternatives rejected (brief):
  - Route-level lock simulation/retry loops: rejected, nondeterministic and leaky across call paths.
  - Last-write-wins: rejected, violates deterministic lifecycle requirement.

### 3) Contracts / Interfaces
- API changes (endpoints, payloads, status codes):
  - No endpoint shape changes.
  - Transition conflicts now deterministically return `409` with conflict code.
- Error model changes (shape + codes):
  - Add conflict code: `WORKFLOW_STALE_STATE`.
  - Message contract: client can recover by refreshing latest ticket state before retry.
- DB schema changes (tables/columns/indexes/constraints):
  - Add `tickets.row_version INTEGER NOT NULL DEFAULT 0`.
  - Transition updates increment `row_version = row_version + 1`.
  - Guarded updates require both expected status and expected row version.
- Backwards compatibility notes:
  - Existing rows backfill to `row_version = 0`.
  - No API consumer payload break; only conflict determinism is tightened.

### 3A) Contract Notes
- Step 1 contract freeze honored:
  - No changes to Step 1 auth/session/tenant error codes or semantics.
- New Step 2 contract ownership:
  - `WORKFLOW_STALE_STATE` conflict semantics are owned by Step 2 after acceptance.
- Stop-the-line trigger:
  - If idempotency or API reliability requirements require changing Step 2 conflict code semantics, issue Contract Revision back to Step 2 owner.

### 4) Implementation Plan
- Ordered tasks (small, verifiable increments):
  1. Add migration for `tickets.row_version`.
  2. Extend ticket domain mapping to include row version.
  3. Extend repository patch contract to accept expected-state guard options.
  4. Enforce guarded update in repository (`WHERE ... status = expected AND row_version = expected`).
  5. Wire expected-state forwarding from workflow kernel via shared transition helper.
  6. Apply expected-state guards to non-kernel transition paths that mutate ticket status directly.
  7. Add regression and edge-case tests for deterministic 409 behavior.
- File targets / modules likely impacted:
  - `db/migrations/NNN_*.sql`
  - `src/modules/workflow/application/kernel.ts`
  - `src/modules/ticket/application/shared.ts`
  - `src/modules/ticket/application/*` (direct status mutation use cases)
  - `src/modules/ticket/application/ports.ts`
  - `src/modules/ticket/infrastructure/ticket.repository.ts`
  - `tests/workflow/*`, `tests/ticket/*`
- Feature flag / migration steps (if any):
  - No feature flag.
  - Deploy migration before application rollout.

### 4A) PR Checklist
- [ ] `tickets.row_version` migration added.
- [ ] Guarded update path implemented with expected status + row version.
- [ ] Conflicting stale transition returns deterministic `409` + `WORKFLOW_STALE_STATE`.
- [ ] Regression test reproducing approve/reject race class added.
- [ ] At least 2 edge-case tests for same concurrency class added.
- [ ] No Step 1 contract changes introduced.
- [ ] `pnpm tsc --noEmit` passes.
- [ ] `pnpm test` passes.

### 5) Test Plan
MUST INCLUDE:
- Regression tests to reproduce Phase 4 finding(s):
  - Conflicting concurrent transition second-writer is rejected with deterministic `409`.
- At least 2 new edge cases (same failure class):
  - Edge case 1: identical duplicate transition from stale tab fails second attempt.
  - Edge case 2: status changed between read and write by different valid transition yields deterministic stale-state conflict.
- What type: unit/integration/e2e/chaos
  - Unit: kernel + repository guarded update semantics.
  - Integration: ticket transition use-case with guarded patch behavior.
- Assertions (expected results):
  - Only one transition write applies under simulated contention.
  - Audit append does not occur for rejected stale write.
  - Error payload includes `type=ConflictError`, `code=WORKFLOW_STALE_STATE`.
- Any test data setup requirements:
  - Ticket fixture with known status and row_version baseline.

### 6) Observability Proof
- Correlation ID propagation notes:
  - Conflict responses inherit API error correlation ID in payload.
- Structured logs/metrics emitted:
  - Existing `workflow.transition_failed` logs must include stale-state conflict details.
- How to verify in logs:
  - Run stale-transition regression and assert failed transition log with conflict context appears once per rejected write.

### 7) Acceptance Gate (pass/fail)
- Objective pass criteria (explicit):
  - Transition conflicts are deterministic and surfaced as `409 WORKFLOW_STALE_STATE`.
  - No contradictory dual-write lifecycle commits in tested race paths.
  - All new regression and edge-case tests pass.
  - `pnpm tsc --noEmit` and `pnpm test` pass.
- Commands to run (tests, scripts):
  - `pnpm tsc --noEmit`
  - `pnpm test`
  - targeted workflow/ticket concurrency tests.
- Stop-the-line conditions:
  - Any required edits to Step 1 auth/session contracts.
  - Any change requiring non-deterministic retry loops in backend transition flow.

### 8) Edge-Case Additions (Non-blocking Backlog)
- Newly discovered edge cases not implemented in this step:
  - P1: notification dedupe should key off post-commit state to prevent assign/cancel overlap messaging.
  - P1: client stale-view prompts for 409 recovery UX text consistency.
- Priority (P0/P1/P2) and rationale:
  - P1 items are important for operator clarity but not blocking deterministic backend conflict handling.

### 9) Handoff to Next Engineer
- What the next engineer is allowed to implement (scope boundary):
  - Step 3 may implement idempotency keys and duplicate suppression only, using Step 2 conflict semantics as fixed contract.
- What is out-of-scope unless a Contract Revision is issued:
  - Any changes to Step 2 conflict error code or expected-state guard rules.
  - Any new auth/session or tenant-boundary contract changes.
- Required reading / key invariants to honor:
  - This Step 2 section.
  - Roadmap Phase 3 section in `SWRTracker_Hardening_Roadmap.md`.

## Step 3 Execution Result (2026-03-05)
- Acceptance gate: PASS
- Validation:
  - `pnpm tsc --noEmit` -> pass
  - `pnpm test` -> pass (`179/179`)
- Implemented scope summary:
  - Added persisted idempotency ledger (`api_idempotency`) via `018_api_idempotency_ledger.sql`.
  - Added shared idempotency helper enforcing key validation, payload hashing, replay semantics, and mismatch/in-progress conflicts.
  - Enforced `Idempotency-Key` on scoped create/assign/cancel mutation routes.
  - Added deterministic idempotency error codes: `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_INVALID`, `IDEMPOTENCY_KEY_REUSE_MISMATCH`, `IDEMPOTENCY_IN_PROGRESS`.
  - Added regression + edge-case tests for duplicate create/assign suppression and key-reuse mismatch handling.

## Step 3  Idempotency/API Reliability Engineer  SPEC/HANDOFF (v1.0)
### 1) Problem Statement
- Reported issue(s) addressed:
  - Duplicate request creation under network retries or double-click submission.
  - Duplicate assign/cancel mutations under retry behavior.
  - Inconsistent duplicate-failure payloads lacking machine-actionable semantics.
- Why it matters (impact/exploitability):
  - Duplicate mutations create operational confusion and inflated queue volume.
  - Retry storms can mutate workflow state multiple times when clients or networks are unstable.
  - Clients cannot reliably recover without structured duplicate/error contracts.
- Minimal reproduction steps:
  - Send two identical POST mutations with the same idempotency key within a retry window.
  - First request commits; second must return cached success (no second mutation).
  - Reuse same key with different payload; API must return deterministic `409` duplicate-key mismatch.

### 2) Decision / Design
- Invariants introduced or strengthened:
  - Create/assign/cancel mutations are replay-safe when idempotency key is supplied.
  - Same idempotency key cannot be reused for a different request payload on the same mutation scope.
  - Duplicate suppression is enforced server-side at transactional boundary.
- Approach selected (and why):
  - Introduce persisted idempotency ledger table keyed by `(tenant_id, actor_id, endpoint, idempotency_key)`.
  - Require `Idempotency-Key` header for targeted mutation routes in Step 3 scope.
  - Persist successful response status/body and replay it for same-key retries.
  - Return deterministic structured conflicts for key reuse with mismatched payload.
- Alternatives rejected (brief):
  - UI-only button disable protection: rejected as insufficient against network retries.
  - In-memory dedupe cache: rejected due multi-instance inconsistency and restart loss.

### 3) Contracts / Interfaces
- API changes (endpoints, payloads, status codes):
  - Targeted mutation routes now require `Idempotency-Key`:
    - `POST /api/tickets`
    - `POST /api/tickets/[ticketId]/assign`
    - `POST /api/tickets/[ticketId]/requester-cancel`
    - `POST /api/tickets/[ticketId]/field-cancel`
    - `POST /api/tickets/[ticketId]/survey-cancel`
  - Missing/invalid key -> `400` validation error.
  - Key reused with different payload on same scope -> deterministic `409`.
- Error model changes (shape + codes):
  - Add Step 3 codes:
    - `IDEMPOTENCY_KEY_REQUIRED`
    - `IDEMPOTENCY_KEY_INVALID`
    - `IDEMPOTENCY_KEY_REUSE_MISMATCH`
    - `IDEMPOTENCY_IN_PROGRESS`
- DB schema changes (tables/columns/indexes/constraints):
  - Add `api_idempotency` ledger table with unique key on `(tenant_id, actor_id, endpoint, idempotency_key)`.
  - Store request hash and committed response payload/status for deterministic replay.
- Backwards compatibility notes:
  - Existing non-idempotent clients calling targeted mutations must supply header after deployment.
  - Non-targeted routes remain unchanged.

### 3A) Contract Notes
- Step 1 and Step 2 contract freeze honored:
  - No changes to auth/session/tenant boundary contracts.
  - No changes to `WORKFLOW_STALE_STATE` semantics.
- Step 3 contract ownership:
  - Idempotency key requirement and duplicate replay semantics for scoped routes.
- Stop-the-line trigger:
  - Any requirement to alter Step 2 conflict semantics or Step 1 auth contracts requires Contract Revision.

### 4) Implementation Plan
- Ordered tasks (small, verifiable increments):
  1. Add migration for `api_idempotency` table and uniqueness constraint.
  2. Implement idempotency helper for key extraction, request hashing, and transactional replay.
  3. Wire helper into create/assign/cancel routes in strict scope.
  4. Add deterministic error codes for missing/invalid/mismatched keys.
  5. Add regression and edge-case tests for duplicate suppression and mismatch conflicts.
- File targets / modules likely impacted:
  - `db/migrations/NNN_*.sql`
  - `src/lib/idempotency.ts` (new)
  - `src/app/api/tickets/route.ts`
  - `src/app/api/tickets/[ticketId]/assign/route.ts`
  - `src/app/api/tickets/[ticketId]/requester-cancel/route.ts`
  - `src/app/api/tickets/[ticketId]/field-cancel/route.ts`
  - `src/app/api/tickets/[ticketId]/survey-cancel/route.ts`
  - `tests/ticket/*`
- Feature flag / migration steps (if any):
  - No feature flag.
  - Deploy migration before app rollout.

### 4A) PR Checklist
- [ ] `api_idempotency` migration added.
- [ ] Scoped create/assign/cancel routes enforce idempotency key requirement.
- [ ] Retry with same key replays prior success response without re-running mutation.
- [ ] Same-key different-payload returns deterministic `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`.
- [ ] Regression test for duplicate-create failure class added.
- [ ] At least 2 new edge-case tests for same duplicate-mutation class added.
- [ ] No Step 1/Step 2 contract drift.
- [ ] `pnpm tsc --noEmit` passes.
- [ ] `pnpm test` passes.

### 5) Test Plan
MUST INCLUDE:
- Regression tests to reproduce Phase 4 finding(s):
  - Duplicate create mutation retry returns cached response and does not create a second logical mutation.
- At least 2 new edge cases (same failure class):
  - Edge case 1: same idempotency key reused with different payload returns deterministic `409` mismatch.
  - Edge case 2: duplicate assign/cancel retries with same key replay success and do not apply second mutation.
- What type: unit/integration/e2e/chaos
  - Unit: idempotency helper hash/scope and replay behavior.
  - Integration: ticket create/assign/cancel routes with idempotency wiring.
- Assertions (expected results):
  - Mutation function executes once for duplicate keyed retries.
  - Response payload/status is replayed deterministically on retry.
  - Error payload includes machine-readable idempotency conflict codes.
- Any test data setup requirements:
  - Authenticated actor fixture and deterministic route request bodies per mutation scope.

### 6) Observability Proof
- Correlation ID propagation notes:
  - Idempotency validation/conflict responses continue to include API `correlationId`.
- Structured logs/metrics emitted:
  - Reuse existing `workflow.transition_failed` for transition conflicts.
  - Add minimal counters/log events for idempotency replay and key mismatch paths.
- How to verify in logs:
  - Execute duplicate-key regression and confirm replay/mismatch events with correlation context.

### 7) Acceptance Gate (pass/fail)
- Objective pass criteria (explicit):
  - Scoped create/assign/cancel mutations are replay-safe and deterministic.
  - Duplicate keyed retries do not execute a second mutation.
  - Same-key payload mismatch is rejected with `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`.
  - All Step 3 regression + edge-case tests pass.
  - `pnpm tsc --noEmit` and `pnpm test` pass.
- Commands to run (tests, scripts):
  - `pnpm tsc --noEmit`
  - `pnpm test`
  - targeted `tests/ticket/*idempotency*` tests.
- Stop-the-line conditions:
  - Any requirement to alter Step 1/Step 2 owned contracts.

### 8) Edge-Case Additions (Non-blocking Backlog)
- Newly discovered edge cases not implemented in this step:
  - P1: idempotency TTL/cleanup worker to cap ledger growth.
  - P1: optional payload canonicalization for semantically equivalent but differently ordered JSON arrays.
- Priority (P0/P1/P2) and rationale:
  - P1 impacts long-term operations and storage cost, not immediate duplicate suppression correctness.

### 9) Handoff to Next Engineer
- What the next engineer is allowed to implement (scope boundary):
  - Step 4 may implement orphan detection/reassignment/escalation workflows only.
- What is out-of-scope unless a Contract Revision is issued:
  - Any Step 3 idempotency contract rename/removal.
  - Any Step 1/Step 2 contract modifications.
- Required reading / key invariants to honor:
  - This Step 3 section.
  - Roadmap Phase 4 in `SWRTracker_Hardening_Roadmap.md`.

## Step 4 Execution Result (2026-03-05)
- Acceptance gate: PASS
- Validation:
  - `pnpm tsc --noEmit` -> pass
  - `pnpm test` -> pass (`183/183`)
- Implemented scope summary:
  - Added orphan-workflow detection in notification repository for active tickets with deactivated owners.
  - Added deterministic auto-reassignment path to active project-admin fallback with row-version guard and audit append.
  - Added SLA-based orphan escalation path when fallback reassignment is unavailable.
  - Extended worker cycle results/logging with orphan reassigned/escalated/unresolved counters.
  - Added regression and edge-case tests for reassignment, escalation, and SLA suppression behavior.

## Step 4  Workflow Integrity/Offboarding Engineer  SPEC/HANDOFF (v1.0)
### 1) Problem Statement
- Reported issue(s) addressed:
  - Ownerless in-flight requests after user offboarding/deactivation.
  - No automatic reassignment path for owner-dependent active workflow tickets.
  - No SLA-based escalation when reassignment cannot be completed.
- Why it matters (impact/exploitability):
  - Active tickets can stall indefinitely when assigned owners are deactivated.
  - Operations teams lose deterministic recovery behavior during staffing churn.
  - Missing escalation path hides unresolved orphaned work.
- Minimal reproduction steps:
  - Deactivate user assigned as Party Chief / Instrument Man / Survey Lead on an active ticket.
  - Run worker cycle.
  - Ticket should be auto-reassigned to active project admin; if unavailable and SLA breached, escalation must be emitted.

### 2) Decision / Design
- Invariants introduced or strengthened:
  - Active workflow tickets cannot remain ownerless after offboarding without deterministic handling.
  - Reassignment attempts are deterministic and tenant-scoped.
  - Unresolved orphaned tickets trigger SLA-based escalation.
- Approach selected (and why):
  - Extend notification worker pipeline with orphan detection/reassignment pass.
  - Detect orphaned active tickets by joining owner references to deactivated users.
  - Reassign orphaned ownership to deterministic active project admin fallback.
  - Escalate unresolved orphan tickets once SLA threshold is exceeded.
- Alternatives rejected (brief):
  - Manual-only remediation: rejected, too slow and non-deterministic.
  - Status rollback on orphan detection: rejected, risks workflow regression and lost context.

### 3) Contracts / Interfaces
- API changes (endpoints, payloads, status codes):
  - No public API endpoint shape changes in this step.
  - Worker/diagnostic artifacts extended with orphan reassignment/escalation counters.
- Error model changes (shape + codes):
  - No new public API error codes in Step 4.
  - Worker logs include deterministic orphan handling event metadata.
- DB schema changes (tables/columns/indexes/constraints):
  - Add migration for orphan-workflow operational support tables/indexes if required.
  - Ticket reassignment updates preserve tenant scope and optimistic version increment semantics.
- Backwards compatibility notes:
  - Existing API consumers unaffected.
  - Operational behavior changes only in background worker and ticket ownership mutation path.

### 3A) Contract Notes
- Step 1-3 contract freeze honored:
  - No auth/session contract changes.
  - No stale-state conflict contract changes.
  - No idempotency contract changes.
- Step 4 contract ownership:
  - Orphan detection + reassignment + SLA escalation behavior in worker flow.
- Stop-the-line trigger:
  - Any requirement to alter Step 1-3 owned contracts requires Contract Revision.

### 4) Implementation Plan
- Ordered tasks (small, verifiable increments):
  1. Add orphan-workflow persistence/migration support (if needed).
  2. Extend notification repository contract for orphan candidate listing and deterministic reassignment update.
  3. Implement workflow orphan repair function in notification application layer.
  4. Wire orphan repair into worker cycle and result counters.
  5. Add regression and edge-case tests for reassignment and escalation behavior.
- File targets / modules likely impacted:
  - `db/migrations/NNN_*.sql`
  - `src/modules/notification/application/index.ts`
  - `src/modules/notification/application/worker.ts`
  - `src/modules/notification/infrastructure/index.ts`
  - `src/workers/notification-worker.ts`
  - `tests/notification/*`
- Feature flag / migration steps (if any):
  - No feature flag.
  - Deploy migration before worker rollout.

### 4A) PR Checklist
- [ ] Orphaned active-ticket candidate detection implemented with tenant-scoped query logic.
- [ ] Deterministic auto-reassignment to active project admin fallback implemented.
- [ ] SLA escalation path for unresolved orphaned tickets implemented.
- [ ] Worker cycle counters/logs include orphan repair outcomes.
- [ ] Regression test reproducing offboarding orphan failure mode added.
- [ ] At least 2 edge-case tests for same orphan workflow class added.
- [ ] No Step 1-3 contract drift.
- [ ] `pnpm tsc --noEmit` passes.
- [ ] `pnpm test` passes.

### 5) Test Plan
MUST INCLUDE:
- Regression tests to reproduce Phase 4 finding(s):
  - Offboarded owner on active ticket triggers deterministic reassignment behavior.
- At least 2 new edge cases (same failure class):
  - Edge case 1: no active project admin fallback -> SLA-based escalation emitted.
  - Edge case 2: unresolved orphan below SLA threshold -> no escalation yet.
- What type: unit/integration/e2e/chaos
  - Unit: orphan repair decision logic.
  - Integration: notification repository mapping + worker cycle counters.
- Assertions (expected results):
  - Reassignment mutates ticket owner fields once and appends audit event.
  - Escalation emits notification once per criteria.
  - Tenant boundaries are preserved across candidate/reassignment queries.
- Any test data setup requirements:
  - Active ticket fixtures with deactivated owner references and deterministic fallback admin permutations.

### 6) Observability Proof
- Correlation ID propagation notes:
  - Worker logs include orphan reassignment/escalation metadata with tenant/ticket context.
- Structured logs/metrics emitted:
  - Counters for orphan reassigned, orphan escalated, orphan unresolved.
- How to verify in logs:
  - Execute orphan regression tests and verify corresponding structured worker log events.

### 7) Acceptance Gate (pass/fail)
- Objective pass criteria (explicit):
  - Orphaned active tickets are auto-reassigned when fallback exists.
  - SLA escalation occurs for unresolved orphaned tickets without fallback.
  - Step 4 regression + edge-case tests pass.
  - `pnpm tsc --noEmit` and `pnpm test` pass.
- Commands to run (tests, scripts):
  - `pnpm tsc --noEmit`
  - `pnpm test`
  - targeted `tests/notification/*` orphan/worker tests.
- Stop-the-line conditions:
  - Any required change to Step 1-3 contracts.

### 8) Edge-Case Additions (Non-blocking Backlog)
- Newly discovered edge cases not implemented in this step:
  - P1: role-aware fallback preference hierarchy (PROJECT_ADMIN -> SURVEY_MANAGER) could improve assignment quality.
  - P1: orphan reassignment cool-down windows for high churn projects.
- Priority (P0/P1/P2) and rationale:
  - P1 improves assignment fidelity but is not required for deterministic orphan recovery baseline.

### 9) Handoff to Next Engineer
- What the next engineer is allowed to implement (scope boundary):
  - Step 5 may implement correlation-ID end-to-end proof, dashboard/metrics exposure, and chaos certification only.
- What is out-of-scope unless a Contract Revision is issued:
  - Any Step 1-4 contract semantics changes.
- Required reading / key invariants to honor:
  - This Step 4 section.
  - Roadmap Phase 5/6 in `SWRTracker_Hardening_Roadmap.md`.

## Step 5 Execution Result (2026-03-05)
- Acceptance gate: PASS
- Validation:
  - `pnpm tsc --noEmit` -> pass
  - `pnpm test` -> pass (`186/186`)
- Implemented scope summary:
  - Added request/worker correlation context utility and critical-route correlation wrappers.
  - Correlation IDs now propagate through `x-correlation-id` response headers and error payload `correlationId` on wrapped paths.
  - Structured observability logs now include `correlation_id`.
  - Ops diagnostics dashboard payload now includes hardening metrics (`orphanWorkflowCandidates`, `idempotencyLedger24h`).
  - Added regression and edge-case tests for correlation propagation and diagnostics hardening metrics.

### Certification Report (Step 5)
- Validation basis:
  - Full local regression suite re-run after Step 1-5 hardening (`186/186` pass).
  - Targeted regression tests for security boundary, stale-state concurrency, idempotency replay, and orphan workflow recovery all pass.
- Required metrics:
  - Cross-tenant mutation attempts: `0` successful (blocked paths verified by tenancy/security regression tests).
  - Duplicate ticket creation: `0` successful duplicates (idempotent replay tests verify single logical mutation).
  - Unauthorized privilege usage: `0` successful unauthorized mutations (session revocation/RBAC regression tests pass).
  - Unsafe race-condition state changes: `0` observed (stale-state deterministic conflict tests pass).
- Certification decision:
  - `PASS` for Phase 4 hardening objectives required before Phase 5 feature expansion.

## Step 5  Observability/Chaos Engineer  SPEC/HANDOFF (v1.0)
### 1) Problem Statement
- Reported issue(s) addressed:
  - Correlation IDs are not consistently propagated end-to-end across API errors/logging paths.
  - Operational diagnostics lack hardening-focused metrics dashboard slices.
  - No formal post-hardening certification report ties regression outcomes to Phase 4 targets.
- Why it matters (impact/exploitability):
  - Incident triage is slow without request-level correlation continuity.
  - Operators cannot quickly verify hardening objectives in one view.
  - Phase 5 readiness decisions require objective certification evidence.
- Minimal reproduction steps:
  - Submit API requests with and without `x-correlation-id` and inspect responses/log output.
  - Query diagnostics endpoint for hardening metrics visibility.
  - Re-run regression suite and produce target-metric certification summary.

### 2) Decision / Design
- Invariants introduced or strengthened:
  - Critical request flows carry a deterministic correlation ID through logs and error envelopes.
  - Diagnostics expose a compact hardening dashboard slice for operational validation.
  - Certification report uses explicit pass/fail metrics tied to roadmap success criteria.
- Approach selected (and why):
  - Add request-correlation context helper (header-aware) and wire into critical routes.
  - Surface correlation ID in API response headers and structured logs.
  - Extend ops diagnostics with minimal hardening counters.
  - Use local regression/chaos-equivalent checks to produce certification summary.
- Alternatives rejected (brief):
  - Logging-only correlation without response propagation: rejected; weak client/operator traceability.
  - Separate dashboard service: rejected; unnecessary scope expansion for this hardening step.

### 3) Contracts / Interfaces
- API changes (endpoints, payloads, status codes):
  - Critical API routes include `x-correlation-id` response header.
  - Existing error payload `correlationId` aligns with request context where available.
  - Ops diagnostics response adds hardening metrics section.
- Error model changes (shape + codes):
  - No new error codes; existing structured shape is preserved with stronger correlation consistency.
- DB schema changes (tables/columns/indexes/constraints):
  - No schema changes required for Step 5 baseline.
- Backwards compatibility notes:
  - Additive response headers and diagnostics fields only.

### 3A) Contract Notes
- Step 1-4 contract freeze honored:
  - No changes to security/concurrency/idempotency/workflow behavior contracts.
- Step 5 contract ownership:
  - Correlation propagation and certification reporting conventions.
- Stop-the-line trigger:
  - Any required semantic contract change in prior steps requires Contract Revision.

### 4) Implementation Plan
- Ordered tasks (small, verifiable increments):
  1. Add request-correlation context utility and wire to critical routes.
  2. Update observability/error mapping to consume shared correlation context.
  3. Extend diagnostics metrics payload for hardening visibility.
  4. Add regression tests for correlation propagation and diagnostics metrics.
  5. Run full regression/validation and produce certification report section.
- File targets / modules likely impacted:
  - `src/lib/correlation.ts` (new)
  - `src/lib/observability.ts`
  - `src/lib/api-error.ts`
  - `src/app/api/tickets/*` (critical route wrappers)
  - `src/app/api/ops/diagnostics/*`
  - `tests/lib/*`
  - `tests/ops/*`
  - `HARDENING_PIPELINE.md`
- Feature flag / migration steps (if any):
  - No feature flag.

### 4A) PR Checklist
- [ ] Correlation helper introduced and wired to critical request paths.
- [ ] `x-correlation-id` response header emitted on critical API responses.
- [ ] Structured logs include correlation ID when request context exists.
- [ ] Diagnostics include hardening metrics section.
- [ ] Regression test for correlation propagation added.
- [ ] At least 2 edge-case tests for correlation/diagnostics observability class added.
- [ ] `pnpm tsc --noEmit` passes.
- [ ] `pnpm test` passes.

### 5) Test Plan
MUST INCLUDE:
- Regression tests to reproduce Phase 4 finding(s):
  - Correlation ID can be traced from API request to error payload/log context on critical paths.
- At least 2 new edge cases (same failure class):
  - Edge case 1: request omits `x-correlation-id` -> server generates deterministic response header/id.
  - Edge case 2: request provides `x-correlation-id` -> value is preserved in response header/error payload.
- What type: unit/integration/e2e/chaos
  - Unit: correlation helper and context propagation.
  - Integration: ops diagnostics response contract and critical route correlation headers.
- Assertions (expected results):
  - Correlation ID present in response headers and error payloads.
  - Diagnostics hardening metrics fields are present and typed.
- Any test data setup requirements:
  - Route handler stubs with authenticated tenant-admin context for diagnostics coverage.

### 6) Observability Proof
- Correlation ID propagation notes:
  - Critical request flows now run inside correlation context seeded from `x-correlation-id` or generated server value.
- Structured logs/metrics emitted:
  - Existing observability logs include `correlation_id` field.
  - Diagnostics payload includes hardening counters for quick dashboard visibility.
- How to verify in logs:
  - Run correlation tests and inspect emitted structured logs for matching `correlation_id`.

### 7) Acceptance Gate (pass/fail)
- Objective pass criteria (explicit):
  - Correlation IDs propagate end-to-end for critical hardening routes.
  - Diagnostics expose hardening metrics without breaking existing contract consumers.
  - Full regression suite passes.
  - Certification report includes required success metrics with explicit values.
- Commands to run (tests, scripts):
  - `pnpm tsc --noEmit`
  - `pnpm test`
- Stop-the-line conditions:
  - Any regression in Step 1-4 hardening invariants.

### 8) Edge-Case Additions (Non-blocking Backlog)
- Newly discovered edge cases not implemented in this step:
  - P1: propagate correlation IDs to outbound email provider metadata for cross-system tracing.
  - P2: long-lived background chains could benefit from parent/child trace IDs.
- Priority (P0/P1/P2) and rationale:
  - P1/P2 are observability maturity items, not blockers for Phase 4 hardening certification.

### 9) Handoff / Certification Exit
- This is the final hardening step; no downstream engineer handoff.
- Deliver certification report with pass/fail metrics:
  - Cross-tenant mutation attempts
  - Duplicate ticket creation
  - Unauthorized privilege usage
  - Unsafe race-condition state changes
