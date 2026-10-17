# SaaS Stress Testing Audit - Group 2
Date: 2026-03-05  
Role: AUDITOR

## Scope and Method
- Reviewed architecture, API routes, module boundaries, workflow engine, notification worker, and schema migrations.
- Baseline validation:
  - `pnpm tsc --noEmit`: pass
  - `pnpm test`: pass (159/159)
- Assessed requested stress scenarios (`~1,000` concurrent requests, `~10,000` tickets, high API traffic) through code-path/query analysis and current runtime configuration.

## Team Lens Summary (6 Agent Roles)
- SaaS Architect: modular monolith boundaries are mostly respected, but some business checks remain in route layer and high-risk cross-tenant guard gaps exist.
- Security Engineer: found tenant-boundary and session-hardening weaknesses.
- Database Engineer: found integrity and indexing gaps that can amplify race and read pressure.
- DevOps Engineer: found scaling risks in pool sizing and worker idempotency behavior.
- Product Analyst: reporting and bulk operations are materially incomplete for enterprise expectations.
- UX Researcher: onboarding friction remains high for first-time users (manual tenant/company inputs, weak admin tooling).

## Critical Issues
1. Cross-tenant membership injection path in project member assignment.
   - Evidence:
     - Route trusts `projectId` path and forwards directly after tenant-admin check on actor tenant only: [route.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/app/api/projects/[projectId]/members/route.ts:40)
     - Use-case does not validate target project/user tenant alignment: [add-project-member.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/tenancy/application/add-project-member.ts:24)
     - Repository inserts membership after project lookup by `id` only (no caller-tenant guard): [tenancy.repository.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/tenancy/infrastructure/tenancy.repository.ts:936)
   - Impact: tenant boundary violation and potential privilege escalation if foreign IDs are known.

2. Workflow transition race condition allows conflicting state commits and duplicate audit history.
   - Evidence:
     - Transition flow is read -> validate -> patch without row lock/version check: [kernel.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/workflow/application/kernel.ts:50)
     - Status update is `WHERE id AND tenant_id` only, no expected-status guard: [ticket.repository.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/ticket/infrastructure/ticket.repository.ts:416)
   - Impact: concurrent approve/reject (or similar) can both succeed, producing inconsistent lifecycle and audit timelines.

3. Vacancy "daily" escalation notifications are not idempotent and can fire every worker cycle.
   - Evidence:
     - Sends vacancy notifications for every candidate each run with no sent-marker check: [notification index.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/notification/application/index.ts:196)
     - Worker loop default is every 300 seconds: [notification-worker-loop.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/workers/notification-worker-loop.ts:10)
   - Impact: notification storm, enterprise trust risk, and operational cost spike.

## Major Issues
1. No brute-force/rate-limit controls on auth endpoints.
   - Evidence: login executes auth directly with no request throttling logic: [login handler.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/app/api/auth/login/handler.ts:42)
   - Impact: credential-stuffing exposure.

2. Session hardening gap: deactivated users can still authenticate; active JWTs are not revalidated against user state.
   - Evidence:
     - Login query does not filter `deactivated_at`: [user.repository.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/identity/infrastructure/user.repository.ts:60)
     - Auth middleware validates token signature only: [auth.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/lib/auth.ts:55)
   - Impact: account disablement is not a strong immediate control.

3. Project/tenant bootstrap and company creation surfaces are overexposed.
   - Evidence:
     - Public tenant creation endpoint: [tenants route.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/app/api/tenants/route.ts:2)
     - Any authenticated user can create a company; no admin role gate: [companies route.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/app/api/companies/route.ts:20), [create-company.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/tenancy/application/create-company.ts:12)
   - Impact: tenant data pollution and abuse surface expansion.

4. High-load DB pressure risk due query patterns + missing supporting indexes.
   - Evidence:
     - Ticket list performs count + page query per request: [ticket.repository.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/ticket/infrastructure/ticket.repository.ts:437)
     - Notification candidate query repeatedly probes `ticket_events` by `(ticket_id, tenant_id, event_type)` but no index exists on that pattern: [notification infrastructure.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/notification/infrastructure/index.ts:49), [001_initial_schema.sql](/C:/Users/xwall/ProjectPrograms/SWRTracker/db/migrations/001_initial_schema.sql:153)
     - DB pool uses default `pg` pool size (no tuning), likely bottleneck under 1,000 concurrent requests: [db.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/lib/db.ts:13)
   - Impact: latency spikes, connection queueing, and worker contention.

5. Reporting capability is effectively unimplemented.
   - Evidence: reporting application/infrastructure are placeholders only: [reporting app](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/reporting/application/index.ts:1), [reporting infra](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/reporting/infrastructure/index.ts:1)
   - Impact: blocks enterprise adoption for analytics/operational visibility.

## Moderate Issues
1. Invalid/malformed JSON payloads can become generic 500s instead of 400 validation responses.
   - Evidence:
     - Handlers parse with `req.json()` and rely on generic catch: [login handler.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/app/api/auth/login/handler.ts:28)
     - Unknown errors map to 500: [api-error.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/lib/api-error.ts:45)

2. Whitelist change audit events are defined but not emitted in route flow.
   - Evidence:
     - Contract notes caller must audit whitelist changes: [whitelist.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/tenancy/application/whitelist.ts:5)
     - Route performs add/remove without `appendAuditEvent`: [whitelist route.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/app/api/projects/[projectId]/whitelist/route.ts:18)
     - Event names exist in audit type set: [audit types.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/modules/audit/domain/types.ts:38)

3. Attachment metadata API returns `storageKey` directly.
   - Evidence: [attachments handler.ts](/C:/Users/xwall/ProjectPrograms/SWRTracker/src/app/api/tickets/[ticketId]/attachments/handler.ts:140)
   - Impact: increased object-key exposure risk if storage is later externally reachable.

4. Enterprise product gaps: no bulk ticket operations, limited notification controls, limited management UX for onboarding and administration.

## Minor Issues
1. API edge hardening is minimal (no explicit UUID format validation; failures are DB-driven).
2. Worker run history retention strategy is undefined (background table can grow unbounded).
3. Middleware only checks cookie presence for page gating; all trust shifted to route-level auth checks (acceptable but fragile if new routes omit auth).

## Stress Test Outlook (Modeled)
- `1,000` concurrent requests:
  - Current design likely saturates default DB pool quickly and induce queue latency.
  - Ticket list endpoints will amplify load with two queries/request and offset pagination.
- `10,000` stored tickets:
  - Core ticket listing likely remains functional but role-specific filters without dedicated compound indexes will degrade.
  - Notification candidate scans will become expensive due repeated `ticket_events` existence checks without matching index.
- High API traffic:
  - Most acute risks: auth brute force, transition races, notification duplication behavior.

## Final Assessment
- Overall system maturity score: **5.8 / 10**
- Architecture scalability outlook: **moderate risk** (good modular baseline, but concurrency/idempotency/indexing gaps are material)
- Beta readiness: **conditional / not ready for enterprise beta** until critical items are remediated

## Recommended Next Engineering Priorities
1. Close tenant-boundary exploit path in project member assignment (project+user tenant assertions at route/use-case/repo layers).
2. Add optimistic concurrency control for ticket transitions (`WHERE status = expected_status` or row locking) and enforce single-writer transition semantics.
3. Fix notification idempotency (`daily` dedupe markers + distributed-safe locking strategy).
4. Add auth rate-limiting/lockout protections and user-state checks on auth/session validation.
5. Add missing high-impact indexes (`ticket_events(ticket_id, tenant_id, event_type)`, requester/department visibility paths).
6. Ship minimum viable reporting and bulk operations to satisfy expected ticketing SaaS baseline.
