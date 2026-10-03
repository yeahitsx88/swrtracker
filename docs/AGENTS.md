# Repository instructions

## Authority and scope

Follow the current user's authorized scope. Product authority is [approved requirements](REQUIREMENTS_ADCQ-260923-001.md) plus approved [decision log](worklogs/LEAD_DECISION_LOG.md) entries, including Decisions 44–50. Open questions remain open. [CLAUDE.md](CLAUDE.md) provides unaffected historical rules and architecture; it cannot override later approvals. Read the latest [CODEX.md](CODEX.md) batch and relevant audit evidence.

Use [README.md](README.md) for setup/tests. Preserve terminology, fixed roles and approved workflows. Record unapproved changes as OPEN / PENDING. Do not invent generalized RBAC, change the stack or redesign working UI during stabilization.

## Safe work

- Inspect branch, worktree and status. Preserve user changes and retained operational fixtures. A prior rehearsal UUID/port is not a new sandbox.
- Never run beta:reset, global truncation, seeds or volume removal against retained data. Verification uses newly owned disposable schemas/volumes and explicit loopback opt-in.
- When testing is authorized, baseline before changes and record existing failures separately. After coherent increments inspect the diff and run focused verification. Implementation done criteria include typecheck, unit tests, production build and applicable actual PostgreSQL/HTTP/browser gates.
- Append CODEX.md batches: intent, changed behavior, verification and limitations. Preserve historical entries/evidence.
- Keep secrets/runtime/generated files ignored; never print private manifests or credentials.

## Module ownership

Implementation normally belongs to one module under src/modules/. Domain stays free of persistence/HTTP I/O, application owns business rules, infrastructure implements ports, and routes authenticate/validate/coordinate transactions. Avoid circular imports; preserve established approved lifecycle dependencies.

Cross-module work may proceed when the user authorizes that scope; document ownership/reason in CODEX.md. Alpha 1 project-wide hardening is such an exception. Serialize migrations/shared-file writes. Delegate only when the user or an applicable skill explicitly requests it, with disjoint file ownership or read-only reviews.

AUDITOR normally reports; IMPLEMENTER fixes authorized scope; TEST_WRITER adds coverage. Combined audit-and-fix authorization permits sequential roles. Existing scoped fixtures are authoritative; no shared tests/setup framework exists.

## Invariants

- Server authorization precedes resource use and recorded replay. Revalidate sessions/authority after waiting for lifecycle locks.
- Domain reads remain tenant/project scoped with company/role/ownership visibility. UUID knowledge grants no access.
- Tenant SHARED/EXCLUSIVE lifecycle barriers precede domain/advisory/idempotency locks. Update writer inventory/tests for new writers.
- Request transitions and ticket_events are atomic. Administrative transitions use their established administrative/lifecycle evidence tables in the same transaction. Retain append-only evidence.
- Draft deletion is soft. Thirty-day recovery requires an actual independent Project Admin grant; TENANT_ADMIN alone is insufficient. Number requests only at first submission.
- Exact uncertain body/key survives retry; every definitive 409 requires deliberate reload and renewed consent. Siblings cannot discard uncertain intent.
- Recommissioning preparation blocks ordinary workflow. Migration033 must precede runtime; older runtimes cannot resume against preparing projects. No preparation-cancel shortcut is approved.

## Migrations and verification

Use the next sequential migration number and preserve deployed files. Prefer repeatable additive changes with preflight checks. Do not silently repair historical evidence or drop columns without authorization. Run migration operators sequentially.

Follow [test standards](skills/test-standards.md) and [workflow invariants](skills/workflow-invariants.md). Cover valid/invalid state, wrong role, foreign scope, revoked/stale access, replay authority, concurrency, fault rollback and history preservation as applicable. Mocks alone do not establish real isolation or locks. One passing suite is not the release gate.
