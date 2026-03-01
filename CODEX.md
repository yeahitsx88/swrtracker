# CODEX

## Purpose

Track Codex-authored remediation batches with a compact, append-only record.

## Batch Log

### 2026-03-01 - Batch 1

- Intent: add a minimal backend test harness, isolated Postgres test utilities, and baseline tests without changing production behavior.
- Files touched:
  - `package.json` (lines 5-10 removed and replaced with 5-12)
  - `.gitignore` (removed lines 9-11 and replaced with 9-12)
  - `.env.test.example` (new)
  - `tests/setup/db.ts` (new)
  - `tests/setup/migrate.ts` (new)
  - `tests/setup/fixtures.ts` (new)
  - `tests/workflow/transitions.test.ts` (new)
  - `tests/lib/api-error.test.ts` (new)
  - `tests/ticket/visibility.test.ts` (new)
- Behavior added:
  - `pnpm test` and `pnpm test:watch` scripts
  - dedicated test environment contract
  - database reset and fixture utilities for tests
  - baseline workflow, error envelope, and repository visibility coverage
- Known gap queued for later batches:
  - subcontractor company isolation is not yet enforced in ticket repository queries
- Production behavior unchanged: yes

### 2026-03-01 - Batch 2

- Intent: model tenant-level roles separately from project roles and enforce tenant-admin permissions on tenancy management paths.
- Files touched:
  - `db/migrations/006_tenant_memberships.sql`
  - `src/lib/get-tenant-role.ts`
  - `src/modules/identity/domain/types.ts`
  - `src/modules/tenancy/application/shared.ts`
  - `src/modules/tenancy/application/create-project.ts`
  - `src/modules/tenancy/application/create-company.ts`
  - `src/modules/tenancy/application/create-area.ts`
  - `src/modules/tenancy/application/create-subarea.ts`
  - `src/modules/tenancy/application/add-project-member.ts`
  - `src/modules/tenancy/application/whitelist.ts`
  - `src/app/api/projects/route.ts`
  - `src/app/api/companies/route.ts`
  - `src/app/api/projects/[projectId]/areas/route.ts`
  - `src/app/api/projects/[projectId]/areas/[areaId]/subareas/route.ts`
  - `src/app/api/projects/[projectId]/members/route.ts`
  - `src/app/api/projects/[projectId]/whitelist/route.ts`
  - `tests/setup/fixtures.ts`
  - `tests/lib/get-tenant-role.test.ts`
  - `tests/tenancy/admin-authorization.test.ts`
- Behavior added:
  - separate `tenant_memberships` storage and `getTenantRole` resolver
  - tenant-admin enforcement in tenancy use cases
  - admin write routes now resolve tenant roles instead of project roles
  - `AREA_VIEWER` is accepted in the project member route, matching docs
- Known gap queued for later batches:
  - tenant-admin read visibility on ticket query endpoints is still unresolved
  - whitelist audit events are still not emitted
- Production behavior changed: yes, admin writes now require tenant-admin membership as documented
