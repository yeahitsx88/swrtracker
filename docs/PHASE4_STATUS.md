# Phase 4 Status

Date Started: 2026-03-04  
Lead Agent Role: System Architect

## Baseline Validation (Pre-Change)
- `pnpm tsc --noEmit`: fail (pre-existing Next.js route export typing errors in `.next/types` for route helper exports)
- `pnpm test`: pass (`150/150`)

## Milestone Tracker

| Milestone | Name | Status | Tasks Completed | Files Modified | Notes |
|---|---|---|---|---|---|
| 0 | Architecture Review | Completed | Architecture validation summary; dependency map; Phase 4 task breakdown | `PHASE4_STATUS.md`, `CODEX.md` | No production code changes in Milestone 0 |
| 1 | Workflow Kernel Isolation | Completed | Introduced `workflow/application/kernel` and delegated ticket transition chokepoint to kernel executor | `src/modules/workflow/application/*`, `src/modules/ticket/application/shared.ts` | All workflow state changes now route through kernel-level authorization + transition + audit orchestration |
| 2 | Background Job Infrastructure | Completed | Added stateless notification worker cycle with persisted run status tracking and one-shot/loop worker entries | `src/modules/notification/application/worker.ts`, `src/modules/notification/infrastructure/job-run.repository.ts`, `src/workers/*`, `db/migrations/015_background_job_runs.sql` | Worker cycle remains retry-safe via existing dedupe/threshold logic |
| 3 | Email Transport | Completed | Added provider-agnostic email transport and wired password reset + notification dispatch through transport adapters | `src/lib/email.ts`, `src/app/api/auth/forgot-password/route.ts`, `src/modules/notification/infrastructure/index.ts` | Defaults to structured console transport unless webhook env is configured |
| 4 | Deployment Infrastructure | Completed | Added container build/runtime assets and single-command compose startup contract | `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `DEPLOYMENT.md`, `package.json` | `docker compose up --build` now launches web + worker |
| 5 | Observability | Completed | Added structured logging utility and integrated transition/job/health/diagnostics logs with required identifiers | `src/lib/observability.ts`, `src/modules/workflow/application/kernel.ts`, `src/app/api/health/route.ts`, `src/modules/notification/application/worker.ts`, `src/app/api/ops/diagnostics/handler.ts` | Logs emit `tenant_id`, `ticket_id`, `actor_id`, `event_type` fields |
| 6 | Test Expansion | Completed | Added worker-cycle, workflow-kernel, diagnostics-route, and password-reset-email dispatch coverage | `tests/notification/worker-cycle.test.ts`, `tests/workflow/kernel.test.ts`, `tests/ops/diagnostics-route.test.ts`, `tests/identity/password-reset-routes.test.ts` | Suite expanded from 150 to 159 tests |
| 7 | UI Integration | Completed | Removed preview/mock-only UI surface to keep frontend API-consumer-only | `src/app/preview/page.tsx` (deleted) | Preview mock route retired |
| 8 | Operational Diagnostics | Completed | Added tenant-admin diagnostics API with workflow health, notification backlog, and worker-run visibility | `src/app/api/ops/diagnostics/*`, `db/migrations/015_background_job_runs.sql` | Includes recent failures for job-run tracking without direct DB access |

## Milestone 0 Outputs

### Architecture Validation Summary
- Modular monolith structure is intact (`src/modules/*`, `src/app/api/*`) and matches CLAUDE.md architecture direction.
- Workflow logic is already centralized in backend modules (`src/modules/workflow/domain/transitions.ts` and ticket application services), not in frontend pages.
- API-first boundary is active: frontend pages call API routes; state transitions execute in server-side application/domain layers.
- Tenant and project isolation are implemented in repository/use-case patterns and covered by existing tests; no new boundary violation introduced in this milestone.
- A blocking baseline quality issue exists before Phase 4 coding: route helper exports in API route files currently break `pnpm tsc --noEmit` due to Next route type constraints.

### Dependency Map (Current)
- `web/api -> application -> domain` is followed across modules.
- Ticket module depends on:
  - Workflow domain (`@/modules/workflow/domain/transitions`)
  - Audit application (`@/modules/audit/application`)
  - Identity role types (`@/modules/identity/domain/types`)
  - Tenancy project-status types (`@/modules/tenancy/domain/types`)
- Attachment module depends on:
  - Audit application
  - Identity/Tenancy/Workflow domain types
- Notification module depends on:
  - Audit application for event emission
- Tenancy module depends on:
  - Identity domain role/tenant-role types
- No direct frontend import of domain transition logic was found in Milestone 0 scan.

### Phase 4 Task Breakdown (Lead Agent Coordinated)
1. Stabilize baseline typecheck so milestone validations can enforce Phase 4 gates.
2. Isolate Workflow Kernel API inside the workflow module and route ticket transitions through a single orchestration boundary.
3. Introduce stateless/idempotent background job runners (timeouts, vacancy escalations, notification dispatch).
4. Add email transport abstraction wiring for password reset and notification sends.
5. Add deployment runtime assets (`Dockerfile`, startup command contract, env var contract checks).
6. Add structured logging and execution traces with required identifiers (`tenant_id`, `ticket_id`, `actor_id`, `event_type`).
7. Expand workflow/authorization/visibility regression matrix in tests.
8. Remove remaining UI preview/mock paths and ensure dashboard surfaces consume live APIs only.
9. Add operational diagnostics surfaces for workflow health, failed jobs, and queue visibility.

## Validation After Milestone 0
- `pnpm tsc --noEmit`: fail (unchanged from baseline; same pre-existing route export typing errors)
- `pnpm test`: pass (`150/150`, unchanged from baseline)

## Validation Snapshot (After Batch 47)
- `pnpm tsc --noEmit`: pass
- `pnpm test`: pass (`150/150`)
- Baseline blocker resolved: Next route export typing issues removed by moving helper exports out of route modules.

## Validation Snapshot (Phase 4 Completion)
- `pnpm tsc --noEmit`: pass
- `pnpm test`: pass (`159/159`)
- Milestones 0 through 8 complete.
