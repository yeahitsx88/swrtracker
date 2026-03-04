\# CODEX



\## Purpose



Track Codex-authored remediation batches with a compact, append-only record.



\## Batch Log



\### 2026-03-01 - Batch 1



\- Intent: add a minimal backend test harness, isolated Postgres test utilities, and baseline tests without changing production behavior.

\- Files touched:

&nbsp; - `package.json` (lines 5-10 removed and replaced with 5-12)

&nbsp; - `.gitignore` (removed lines 9-11 and replaced with 9-12)

&nbsp; - `.env.test.example` (new)

&nbsp; - `tests/setup/db.ts` (new)

&nbsp; - `tests/setup/migrate.ts` (new)

&nbsp; - `tests/setup/fixtures.ts` (new)

&nbsp; - `tests/workflow/transitions.test.ts` (new)

&nbsp; - `tests/lib/api-error.test.ts` (new)

&nbsp; - `tests/ticket/visibility.test.ts` (new)

\- Behavior added:

&nbsp; - `pnpm test` and `pnpm test:watch` scripts

&nbsp; - dedicated test environment contract

&nbsp; - database reset and fixture utilities for tests

&nbsp; - baseline workflow, error envelope, and repository visibility coverage

\- Known gap queued for later batches:

&nbsp; - subcontractor company isolation is not yet enforced in ticket repository queries

\- Production behavior unchanged: yes



\### 2026-03-01 - Batch 2



\- Intent: model tenant-level roles separately from project roles and enforce tenant-admin permissions on tenancy management paths.

\- Files touched:

&nbsp; - `db/migrations/006\_tenant\_memberships.sql`

&nbsp; - `src/lib/get-tenant-role.ts`

&nbsp; - `src/modules/identity/domain/types.ts`

&nbsp; - `src/modules/tenancy/application/shared.ts`

&nbsp; - `src/modules/tenancy/application/create-project.ts`

&nbsp; - `src/modules/tenancy/application/create-company.ts`

&nbsp; - `src/modules/tenancy/application/create-area.ts`

&nbsp; - `src/modules/tenancy/application/create-subarea.ts`

&nbsp; - `src/modules/tenancy/application/add-project-member.ts`

&nbsp; - `src/modules/tenancy/application/whitelist.ts`

&nbsp; - `src/app/api/projects/route.ts`

&nbsp; - `src/app/api/companies/route.ts`

&nbsp; - `src/app/api/projects/\[projectId]/areas/route.ts`

&nbsp; - `src/app/api/projects/\[projectId]/areas/\[areaId]/subareas/route.ts`

&nbsp; - `src/app/api/projects/\[projectId]/members/route.ts`

&nbsp; - `src/app/api/projects/\[projectId]/whitelist/route.ts`

&nbsp; - `tests/setup/fixtures.ts`

&nbsp; - `tests/lib/get-tenant-role.test.ts`

&nbsp; - `tests/tenancy/admin-authorization.test.ts`

\- Behavior added:

&nbsp; - separate `tenant\_memberships` storage and `getTenantRole` resolver

&nbsp; - tenant-admin enforcement in tenancy use cases

&nbsp; - admin write routes now resolve tenant roles instead of project roles

&nbsp; - `AREA\_VIEWER` is accepted in the project member route, matching docs

\- Known gap queued for later batches:

&nbsp; - tenant-admin read visibility on ticket query endpoints is still unresolved

&nbsp; - whitelist audit events are still not emitted

\- Production behavior changed: yes, admin writes now require tenant-admin membership as documented



\### 2026-03-03 - Batch 3



\- Intent: Phase 2A role enum refactor — replace APPROVER and SURVEY\_LEAD with SURVEY\_MANAGER and new Phase 2 roles per CLAUDE.md §7 and §18.

\- Files touched:

&nbsp; - `db/migrations/007\_role\_enum\_phase2.sql` (new — migrates data, updates CHECK constraint)

&nbsp; - `src/modules/identity/domain/types.ts` (ProjectRole union updated)

&nbsp; - `src/modules/ticket/application/approve-ticket.ts` (APPROVER → SURVEY\_MANAGER)

&nbsp; - `src/modules/ticket/application/reject-ticket.ts` (APPROVER → SURVEY\_MANAGER)

&nbsp; - `src/modules/ticket/application/override-rejection.ts` (APPROVER → SURVEY\_MANAGER)

&nbsp; - `src/modules/ticket/application/assign-ticket.ts` (SURVEY\_LEAD → SURVEY\_MANAGER + SURVEY\_SUPERINTENDENT)

&nbsp; - `src/modules/ticket/application/close-ticket.ts` (SURVEY\_LEAD → SURVEY\_MANAGER)

&nbsp; - `src/modules/ticket/application/start-ticket.ts` (SURVEY\_LEAD → SURVEY\_MANAGER)

&nbsp; - `src/modules/ticket/application/complete-ticket.ts` (SURVEY\_LEAD → SURVEY\_MANAGER)

&nbsp; - `src/modules/ticket/application/approve-cancel.ts` (APPROVER + SURVEY\_LEAD → SURVEY\_MANAGER)

&nbsp; - `src/modules/ticket/application/reject-cancel.ts` (APPROVER + SURVEY\_LEAD → SURVEY\_MANAGER)

&nbsp; - `src/modules/ticket/application/request-cancel.ts` (ALL\_PROJECT\_ROLES updated)

&nbsp; - `src/modules/ticket/application/elevate-priority.ts` (SURVEY\_LEAD + APPROVER → SURVEY\_MANAGER)

&nbsp; - `src/modules/ticket/infrastructure/ticket.repository.ts` (buildVisibilityClause: old cases → SURVEY\_MANAGER, new full-visibility roles added)

&nbsp; - `src/modules/workflow/domain/transitions.ts` (comment-only: APPROVER/SURVEY\_LEAD → SURVEY\_MANAGER)

&nbsp; - `src/app/api/projects/\[projectId]/members/route.ts` (VALID\_ROLES updated to full Phase 2 set)

\- Behavior added:

&nbsp; - SURVEY\_MANAGER replaces APPROVER and SURVEY\_LEAD as sole ticket approval authority

&nbsp; - SURVEY\_SUPERINTENDENT added as co-permitted actor for ticket assignment

&nbsp; - DEPARTMENT\_MANAGER, DEPARTMENT\_LEAD, PROJECT\_ADMIN, SUBCONTRACTS\_COORDINATOR added to role enum and visibility (full-project visibility placeholder for Phase 3 scoping)

&nbsp; - AREA\_VIEWER added to membership route validation

\- Known gap queued for later batches:

&nbsp; - Status enum still includes CLOSED, CANCEL\_REQUESTED, CANCEL\_APPROVED, CANCEL\_REJECTED — Task 2

&nbsp; - Priority is still is\_priority boolean — Task 2

&nbsp; - buildVisibilityClause gives PROJECT\_ADMIN, DEPARTMENT\_MANAGER, DEPARTMENT\_LEAD, SUBCONTRACTS\_COORDINATOR full-project visibility as placeholder; scoped visibility deferred to Phase 3

&nbsp; - SURVEY\_SUPERINTENDENT visibility scoped to assigned AOR not yet implemented — Task 9

&nbsp; - Workflow transitions still reference old CLOSED/CANCEL\_REQUESTED states — Task 2

\- Production behavior changed: yes, APPROVER and SURVEY\_LEAD role strings no longer accepted; SURVEY\_MANAGER required for all former APPROVER/SURVEY\_LEAD actions

### 2026-03-04 - Batch 4

\- Intent: close the highest-risk ticket authorization gaps by enforcing project membership on ticket creation, deriving requester company/workflow server-side, and applying visibility checks to ticket mutations

\- Files touched:

&nbsp; - `src/app/api/tickets/route.ts`

&nbsp; - `src/lib/resolve-visibility.ts`

&nbsp; - `src/modules/ticket/application/ports.ts`

&nbsp; - `src/modules/ticket/application/shared.ts`

&nbsp; - `src/modules/ticket/application/submit-ticket.ts`

&nbsp; - `src/modules/ticket/application/approve-ticket.ts`

&nbsp; - `src/modules/ticket/application/reject-ticket.ts`

&nbsp; - `src/modules/ticket/application/override-rejection.ts`

&nbsp; - `src/modules/ticket/application/assign-ticket.ts`

&nbsp; - `src/modules/ticket/application/request-cancel.ts`

&nbsp; - `src/modules/ticket/application/approve-cancel.ts`

&nbsp; - `src/modules/ticket/application/reject-cancel.ts`

&nbsp; - `src/modules/ticket/application/start-ticket.ts`

&nbsp; - `src/modules/ticket/application/complete-ticket.ts`

&nbsp; - `src/modules/ticket/application/close-ticket.ts`

&nbsp; - `src/modules/ticket/infrastructure/ticket.repository.ts`

\- Behavior added:

&nbsp; - `/api/tickets` now requires authenticated project membership and rejects non-REQUESTER actors

&nbsp; - ticket creation now derives `companyId` from the authenticated user instead of trusting request input

&nbsp; - requester ticket creation now forces `STANDARD_APPROVAL` at the web boundary instead of trusting a client-supplied workflow variant

&nbsp; - ticket mutation helpers now load tickets through visibility-scoped reads when route context includes visibility, preventing state changes against tickets the actor cannot see

&nbsp; - subcontractor ticket reads now apply `company_id = actor.company_id` on top of role scoping

\- Known gap queued for later batches:

&nbsp; - ticket numbering is still assigned at create time instead of `DRAFT -> SUBMITTED`

&nbsp; - legacy workflow states and role names are still present across the schema and workflow domain

&nbsp; - route and repository changes could not be validated with `pnpm test` or `pnpm tsc --noEmit` because this workspace currently lacks a working `test` script and the installed TypeScript executable is missing

\- Production behavior changed: yes

### 2026-03-04 - Batch 9
\- Intent: move ticket numbering from draft creation to the `DRAFT -> SUBMITTED` transition so numbering matches the spec and AGENTS rules

\- Files touched:

&nbsp; - `src/modules/ticket/domain/types.ts`

&nbsp; - `src/modules/ticket/application/ports.ts`

&nbsp; - `src/modules/ticket/application/create-ticket.ts`

&nbsp; - `src/modules/ticket/application/submit-ticket.ts`

&nbsp; - `src/modules/ticket/infrastructure/ticket.repository.ts`

&nbsp; - `db/migrations/009_ticket_number_on_submit.sql`

&nbsp; - `tests/ticket/submit-ticket.test.ts`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - drafts are now created with `ticketNumber = null`

&nbsp; - ticket sequence allocation and formatted number generation now happen atomically at submit time

&nbsp; - `ticket.submitted` audit events now carry the generated ticket number payload

\- Known gap queued for later batches:

&nbsp; - the schema and workflow still retain legacy `area` / `subarea` structures instead of the spec's AOR tree

&nbsp; - direct-assignment workflow still uses the older `CREATED` path and needs a separate spec-alignment pass

\- Production behavior changed: yes

### 2026-03-04 - Batch 8

\- Intent: implement a persisted survey-side cancellation request/approval chain so Party Chief and Survey Superintendent initiators no longer cancel directly

\- Files touched:

&nbsp; - `db/migrations/008_survey_cancel_request_state.sql`

&nbsp; - `src/modules/ticket/domain/types.ts`

&nbsp; - `src/modules/ticket/application/ports.ts`

&nbsp; - `src/modules/ticket/application/create-ticket.ts`

&nbsp; - `src/modules/ticket/application/index.ts`

&nbsp; - `src/modules/ticket/application/request-survey-cancel.ts` (new)

&nbsp; - `src/modules/ticket/application/approve-survey-cancel.ts` (new)

&nbsp; - `src/modules/ticket/application/survey-cancel.ts` (deleted)

&nbsp; - `src/modules/ticket/infrastructure/ticket.repository.ts`

&nbsp; - `src/modules/audit/domain/types.ts`

&nbsp; - `src/app/api/tickets/[ticketId]/survey-cancel/route.ts`

&nbsp; - `src/app/api/tickets/[ticketId]/survey-cancel/approve/route.ts` (new)

&nbsp; - `tests/ticket/perform-transition.test.ts`

&nbsp; - `tests/ticket/pc-approval.test.ts`

&nbsp; - `tests/ticket/survey-cancel.test.ts` (new)

\- Behavior added:

&nbsp; - `PARTY_CHIEF` and `SURVEY_SUPERINTENDENT` survey-side cancellations now create a persisted pending request on the ticket instead of canceling immediately

&nbsp; - `SURVEY_MANAGER` can still cancel directly from the initiation endpoint

&nbsp; - new approval endpoint finalizes pending survey-side cancellation requests and clears request metadata

&nbsp; - approval chain now enforces: Party Chief requests require Survey Superintendent or Survey Manager approval; Survey Superintendent requests require Survey Manager approval

&nbsp; - survey-side cancel request metadata is persisted via `survey_cancel_requested_by`, `survey_cancel_requested_role`, `survey_cancel_reason`, and `survey_cancel_requested_at`

\- Known gap queued for later batches:

&nbsp; - there is still no explicit rejection path for survey-side cancellation requests

&nbsp; - pending survey-side cancellation requests do not yet block unrelated ticket actions while awaiting approval

&nbsp; - ticket numbering remains create-time instead of submit-time

\- Production behavior changed: yes

### 2026-03-04 - Batch 7

\- Intent: align the project role model and ticket approval chains to `SURVEY_MANAGER` / `SURVEY_SUPERINTENDENT`

\- Files touched:

&nbsp; - `db/migrations/007_role_enum_phase2.sql`

&nbsp; - `src/modules/identity/domain/types.ts`

&nbsp; - `src/modules/ticket/infrastructure/ticket.repository.ts`

&nbsp; - `src/modules/ticket/application/approve-ticket.ts`

&nbsp; - `src/modules/ticket/application/reject-ticket.ts`

&nbsp; - `src/modules/ticket/application/override-rejection.ts`

&nbsp; - `src/modules/ticket/application/assign-ticket.ts`

&nbsp; - `src/modules/ticket/application/start-ticket.ts`

&nbsp; - `src/modules/ticket/application/complete-ticket.ts`

&nbsp; - `src/modules/ticket/application/delay-ticket.ts`

&nbsp; - `src/modules/ticket/application/request-field-cancel.ts`

&nbsp; - `src/modules/ticket/application/approve-pc-status.ts`

&nbsp; - `src/modules/ticket/application/reject-pc-status.ts`

&nbsp; - `src/modules/ticket/application/restart-delayed-ticket.ts`

&nbsp; - `src/modules/ticket/application/survey-cancel.ts`

&nbsp; - `src/modules/ticket/application/elevate-priority.ts`

&nbsp; - `src/modules/workflow/domain/transitions.ts`

&nbsp; - `src/app/api/projects/[projectId]/members/route.ts`

&nbsp; - `src/app/api/tickets/[ticketId]/assign/route.ts`

&nbsp; - `src/app/api/tickets/[ticketId]/override-rejection/route.ts`

&nbsp; - `tests/ticket/perform-transition.test.ts`

\- Behavior added:

&nbsp; - legacy `APPROVER` role references now use `SURVEY_MANAGER`

&nbsp; - legacy `SURVEY_LEAD` role references now use `SURVEY_SUPERINTENDENT`

&nbsp; - ticket approval, rejection, override-approval, and priority elevation now require `SURVEY_MANAGER`

&nbsp; - ticket assignment now permits `SURVEY_MANAGER` and `SURVEY_SUPERINTENDENT`

&nbsp; - Party Chief approval fallback chains now use `SURVEY_SUPERINTENDENT` and `SURVEY_MANAGER`

&nbsp; - migration `007_role_enum_phase2.sql` updates existing `project_memberships.role` data and the CHECK constraint to the new role strings

\- Known gap queued for later batches:

&nbsp; - broader role-model expansion from the spec (`PROJECT_ADMIN`, department roles, `SUBCONTRACTS_COORDINATOR`) is still deferred

&nbsp; - survey-side cancellation approval chains are still simplified and do not yet persist a separate approval-request state

&nbsp; - visibility is still project-wide placeholder logic for survey-side leadership rather than AOR-scoped

\- Production behavior changed: yes

### 2026-03-04 - Batch 5

\- Intent: restore the local validation baseline by repairing dependency installation, reintroducing explicit typecheck/test scripts, and adding focused regression coverage for the ticket authorization fixes

\- Files touched:

&nbsp; - `package.json`

&nbsp; - `tests/ticket/perform-transition.test.ts`

&nbsp; - `tests/ticket/visibility-repository.test.ts`

\- Behavior added:

&nbsp; - `pnpm typecheck` now runs `tsc --noEmit`

&nbsp; - `pnpm test` now runs Node's test runner through `tsx` for TypeScript test files

&nbsp; - regression tests now cover visibility-gated transition reads and subcontractor company isolation query shaping

&nbsp; - local dependency links were repaired with `pnpm install`, restoring the missing TypeScript executable

\- Known gap queued for later batches:

&nbsp; - the test suite is still minimal and does not yet cover route-level ticket creation authorization or the broader workflow matrix required by AGENTS.md

&nbsp; - the workflow/status model remains on the legacy path and still needs a larger spec-alignment pass

\- Production behavior changed: no

### 2026-03-04 - Batch 6

\- Intent: replace the legacy close/cancel workflow with the current pending-PC-approval and terminal cancellation status model

\- Files touched:

&nbsp; - `db/migrations/006_pending_pc_workflow_state.sql`

&nbsp; - `src/modules/workflow/domain/transitions.ts`

&nbsp; - `src/modules/ticket/domain/types.ts`

&nbsp; - `src/modules/audit/domain/types.ts`

&nbsp; - `src/modules/ticket/application/ports.ts`

&nbsp; - `src/modules/ticket/application/create-ticket.ts`

&nbsp; - `src/modules/ticket/application/complete-ticket.ts`

&nbsp; - `src/modules/ticket/application/index.ts`

&nbsp; - `src/modules/ticket/application/approve-pc-status.ts` (new)

&nbsp; - `src/modules/ticket/application/reject-pc-status.ts` (new)

&nbsp; - `src/modules/ticket/application/delay-ticket.ts` (new)

&nbsp; - `src/modules/ticket/application/restart-delayed-ticket.ts` (new)

&nbsp; - `src/modules/ticket/application/requester-cancel.ts` (new)

&nbsp; - `src/modules/ticket/application/request-field-cancel.ts` (new)

&nbsp; - `src/modules/ticket/application/survey-cancel.ts` (new)

&nbsp; - `src/modules/ticket/application/close-ticket.ts` (deleted)

&nbsp; - `src/modules/ticket/application/request-cancel.ts` (deleted)

&nbsp; - `src/modules/ticket/application/approve-cancel.ts` (deleted)

&nbsp; - `src/modules/ticket/application/reject-cancel.ts` (deleted)

&nbsp; - `src/modules/ticket/infrastructure/ticket.repository.ts`

&nbsp; - `src/app/api/tickets/[ticketId]/pc-approve/route.ts` (new)

&nbsp; - `src/app/api/tickets/[ticketId]/pc-reject/route.ts` (new)

&nbsp; - `src/app/api/tickets/[ticketId]/delay/route.ts` (new)

&nbsp; - `src/app/api/tickets/[ticketId]/restart-delay/route.ts` (new)

&nbsp; - `src/app/api/tickets/[ticketId]/requester-cancel/route.ts` (new)

&nbsp; - `src/app/api/tickets/[ticketId]/field-cancel/route.ts` (new)

&nbsp; - `src/app/api/tickets/[ticketId]/survey-cancel/route.ts` (new)

&nbsp; - `src/app/api/tickets/[ticketId]/close/route.ts` (deleted)

&nbsp; - `src/app/api/tickets/[ticketId]/cancel-request/route.ts` (deleted)

&nbsp; - `src/app/api/tickets/[ticketId]/cancel-approve/route.ts` (deleted)

&nbsp; - `src/app/api/tickets/[ticketId]/cancel-reject/route.ts` (deleted)

&nbsp; - `tests/ticket/perform-transition.test.ts`

&nbsp; - `tests/ticket/pc-approval.test.ts` (new)

&nbsp; - `tests/workflow/transitions.test.ts` (new)

\- Behavior added:

&nbsp; - status enum now uses `PENDING_PC_APPROVAL`, `DELAYED`, `REQUESTER_CANCELED`, `FIELD_CANCELED`, and `SURVEY_CANCELED`; legacy `CLOSED` and `CANCEL_*` states were removed from the workflow model

&nbsp; - `complete` now submits field completion for Party Chief approval instead of finalizing directly

&nbsp; - pending field-status approval is now persisted on the ticket via `pending_pc_outcome` and `pending_pc_reason`

&nbsp; - new workflow endpoints support Party Chief approval/rejection, delayed submission/restart, requester cancel, field cancel initiation, and survey-side cancel

&nbsp; - audit event types now match the current pending-approval and terminal-cancellation workflow terminology

\- Known gap queued for later batches:

&nbsp; - survey-side cancellation approval chains are only partially modeled; `PARTY_CHIEF` currently cancels directly instead of going through a persisted approval request path

&nbsp; - ticket numbering is still assigned at create time instead of `DRAFT -> SUBMITTED`

&nbsp; - legacy role names (`APPROVER`, `SURVEY_LEAD`) are still in the codebase and need a separate role-model alignment pass

&nbsp; - the schema still retains legacy fields such as `closed_at`; cleanup migration deferred

\- Production behavior changed: yes

### 2026-03-04 - Batch 10
\- Intent: remove the legacy `CREATED` state from the direct-assignment workflow and prevent requester draft creation from constructing unsupported Variant 2 tickets

\- Files touched:

&nbsp; - `src/modules/workflow/domain/transitions.ts`

&nbsp; - `src/modules/ticket/application/create-ticket.ts`

&nbsp; - `src/modules/ticket/application/assign-ticket.ts`

&nbsp; - `src/app/api/tickets/[ticketId]/assign/route.ts`

&nbsp; - `db/migrations/010_direct_assignment_assigned_state.sql`

&nbsp; - `tests/workflow/transitions.test.ts`

&nbsp; - `tests/ticket/submit-ticket.test.ts`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - `DIRECT_ASSIGNMENT` workflow now starts at `ASSIGNED`, matching the spec

&nbsp; - the legacy `CREATED` transition path is no longer valid in the workflow domain

&nbsp; - requester draft creation now rejects `DIRECT_ASSIGNMENT` until a dedicated assignment-aware entry point exists

&nbsp; - migration `010_direct_assignment_assigned_state.sql` upgrades any persisted `DIRECT_ASSIGNMENT` tickets in `CREATED` to `ASSIGNED`

\- Known gap queued for later batches:

&nbsp; - there is still no dedicated direct-assignment creation/entry use case that captures assignment context at ticket inception

&nbsp; - workflow-variant selection is still hard-coded at the web boundary instead of being derived from project/build configuration

\- Production behavior changed: yes

### 2026-03-04 - Batch 11
\- Intent: fix the ticket repository insert regression uncovered by the route-level smoke test so ticket creation succeeds at runtime

\- Files touched:

&nbsp; - `src/modules/ticket/infrastructure/ticket.repository.ts`

&nbsp; - `tests/ticket/ticket-repository-save.test.ts`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - `TicketRepository.save` now includes the missing `$36` placeholder for the final `updated_at` value

&nbsp; - regression coverage now asserts the insert SQL and parameter count stay aligned when ticket columns change

\- Known gap queued for later batches:

&nbsp; - the route-level smoke path still depends on ad hoc inline seeding because the repo lacks a reusable app-smoke fixture harness

\- Production behavior changed: yes

### 2026-03-04 - Batch 12
\- Intent: turn the ad hoc ticket route smoke flow into a reusable harness that can seed, exercise, and clean up the create/submit/approve/assign path on a local database

\- Files touched:

&nbsp; - `package.json`

&nbsp; - `tests/ticket/ticket-route-smoke.ts`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - `pnpm smoke:ticket` now runs a reusable route-level smoke harness for the ticket create, submit, approve, and assign flow

&nbsp; - the smoke harness seeds temporary tenant/project/user data, verifies persisted ticket state and audit events, and cleans up smoke rows including `ticket_sequences`

&nbsp; - the harness requires `DATABASE_URL` and `JWT_SECRET`, making the local run contract explicit

\- Known gap queued for later batches:

&nbsp; - the smoke harness still seeds directly with SQL instead of reusing a shared fixture library because the repo does not yet have DB-backed integration fixture helpers

\- Production behavior changed: no

### 2026-03-04 - Batch 13
\- Intent: lay down the missing Phase 2 schema foundation and move the active ticket path from legacy area/is\_priority fields onto AOR + priority enum contracts

\- Files touched:

&nbsp; - `db/migrations/011_phase2_schema_foundation.sql`

&nbsp; - `src/modules/identity/domain/types.ts`

&nbsp; - `src/modules/ticket/domain/types.ts`

&nbsp; - `src/modules/ticket/application/ports.ts`

&nbsp; - `src/modules/ticket/application/create-ticket.ts`

&nbsp; - `src/modules/ticket/application/submit-ticket.ts`

&nbsp; - `src/modules/ticket/application/elevate-priority.ts`

&nbsp; - `src/modules/ticket/infrastructure/ticket.repository.ts`

&nbsp; - `src/lib/resolve-visibility.ts`

&nbsp; - `src/app/api/tickets/route.ts`

&nbsp; - `tests/ticket/submit-ticket.test.ts`

&nbsp; - `tests/ticket/perform-transition.test.ts`

&nbsp; - `tests/ticket/pc-approval.test.ts`

&nbsp; - `tests/ticket/survey-cancel.test.ts`

&nbsp; - `tests/ticket/ticket-repository-save.test.ts`

&nbsp; - `tests/ticket/ticket-route-smoke.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - migration `011_phase2_schema_foundation.sql` adds Phase 2 tables and columns for AOR hierarchy, departments, acting grants, templates, project lifecycle fields, invite cancellation, help-flag ticket snapshots, and ticket `priority` / `aor_node_id`

&nbsp; - legacy `areas` / `subareas` / `area_memberships` data is backfilled into `aor_levels` / `aor_nodes` / `aor_assignments` so existing projects have an initial AOR tree

&nbsp; - ticket creation, numbering, repository persistence, and AREA\_VIEWER / SURVEY\_SUPERINTENDENT visibility resolution now use `aor_node_id`

&nbsp; - the active ticket path now uses a `priority` enum contract instead of the old `is_priority` boolean

&nbsp; - the live `ProjectRole` union now includes `PROJECT_ADMIN`, `DEPARTMENT_MANAGER`, `DEPARTMENT_LEAD`, and `SUBCONTRACTS_COORDINATOR`

\- Known gap queued for later batches:

&nbsp; - tenancy setup APIs and domain types still expose legacy `areas` / `subareas` routes instead of Phase 2 AOR management endpoints

&nbsp; - direct-assignment still lacks a dedicated creation entry point that starts with assignment context

&nbsp; - department-scoped visibility and title-delegation workflows are not implemented yet on top of the new schema

\- Production behavior changed: yes

### 2026-03-04 - Batch 14
\- Intent: add the Phase 2 AOR setup surface for project configuration so Project Admin can create AOR levels and nodes instead of relying on legacy area/subarea setup routes

\- Files touched:

&nbsp; - `src/modules/tenancy/domain/types.ts`

&nbsp; - `src/modules/tenancy/application/ports.ts`

&nbsp; - `src/modules/tenancy/infrastructure/tenancy.repository.ts`

&nbsp; - `src/modules/tenancy/application/create-aor-level.ts` (new)

&nbsp; - `src/modules/tenancy/application/create-aor-node.ts` (new)

&nbsp; - `src/modules/tenancy/application/index.ts`

&nbsp; - `src/app/api/projects/[projectId]/aor/route.ts` (new)

&nbsp; - `tests/tenancy/aor-setup.test.ts` (new)

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - new tenancy use cases create `aor_levels` and `aor_nodes` with validation for duplicate level depths and correct parent-child depth relationships

&nbsp; - new `POST /api/projects/[projectId]/aor` setup surface supports `kind=LEVEL` and `kind=NODE` for Phase 2 AOR hierarchy creation

&nbsp; - tenancy repository now reads and writes the Phase 2 AOR tables directly

&nbsp; - unit coverage now exercises AOR level creation, duplicate-depth rejection, valid child-node creation, invalid parent rejection, and admin-only authorization at the use-case layer

\- Known gap queued for later batches:

&nbsp; - the workspace still lacks a tenant-admin role resolver / membership source, so the new AOR route currently authorizes `PROJECT_ADMIN` only even though the spec allows `TENANT_ADMIN` too

&nbsp; - legacy `/areas` and `/areas/[areaId]/subareas` routes still exist as compatibility ballast and should be retired once callers move to the AOR surface

&nbsp; - no department, AOR-assignment, or node-retirement write surfaces exist yet on top of the new schema

\- Production behavior changed: yes

### 2026-03-04 - Batch 15
\- Intent: restore tenant-level authorization as a real data-backed capability so `TENANT_ADMIN` can use the new AOR setup surface and the existing tenant-admin routes stop reading project roles

\- Files touched:

&nbsp; - `db/migrations/012_tenant_memberships.sql`

&nbsp; - `src/lib/get-tenant-role.ts` (new)

&nbsp; - `src/app/api/projects/[projectId]/aor/route.ts`

&nbsp; - `src/app/api/projects/[projectId]/members/route.ts`

&nbsp; - `src/app/api/projects/[projectId]/whitelist/route.ts`

&nbsp; - `tests/lib/get-tenant-role.test.ts` (new)

&nbsp; - `tests/tenancy/aor-setup.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - migration `012_tenant_memberships.sql` adds a dedicated `tenant_memberships` table for `TENANT_ADMIN` / `BILLING_VIEWER`

&nbsp; - new `getTenantRole` helper resolves tenant-level roles without abusing project membership lookups

&nbsp; - `/api/projects/[projectId]/aor` now allows `TENANT_ADMIN` as well as `PROJECT_ADMIN`, matching the AOR setup spec

&nbsp; - tenant-admin routes that already claimed tenant-admin semantics (`members`, `whitelist`) now resolve actor role from `tenant_memberships` instead of `project_memberships`

&nbsp; - regression coverage now verifies tenant-role resolution and confirms the AOR setup use case accepts `TENANT_ADMIN`

\- Known gap queued for later batches:

&nbsp; - project creation still does not enforce `TENANT_ADMIN` at the route/use-case boundary even though the spec assigns project record creation to tenant admin

&nbsp; - there is still no write surface for creating or managing `tenant_memberships`, so population currently depends on direct DB seeding/migration tooling

&nbsp; - legacy `/areas` and `/areas/[areaId]/subareas` routes still remain as compatibility ballast

\- Production behavior changed: yes

### 2026-03-04 - Batch 16
\- Intent: enforce `TENANT_ADMIN` on `POST /api/projects` and align new project creation with the spec-default `SETUP` state

\- Files touched:

&nbsp; - `src/modules/tenancy/application/create-project.ts`

&nbsp; - `src/app/api/projects/route.ts`

&nbsp; - `tests/tenancy/create-project.test.ts` (new)

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - project creation now requires tenant-level role `TENANT_ADMIN` in the application layer and route path

&nbsp; - newly created projects now start in `SETUP`, matching the Phase 2 lifecycle spec

&nbsp; - regression coverage now verifies both the tenant-admin gate and the `SETUP` default state

\- Known gap queued for later batches:

&nbsp; - project creation still does not capture the full Step 1 setup inputs from the spec such as `crew_build` and optional template selection

&nbsp; - there is still no write surface for managing `tenant_memberships`

\- Production behavior changed: yes

### 2026-03-04 - Batch 17
\- Intent: close the remaining Step 1 project-creation gap by capturing `crew_build` and optional template selection on `POST /api/projects`

\- Files touched:

&nbsp; - `src/modules/tenancy/domain/types.ts`

&nbsp; - `src/modules/tenancy/application/index.ts`

&nbsp; - `src/modules/tenancy/application/ports.ts`

&nbsp; - `src/modules/tenancy/infrastructure/tenancy.repository.ts`

&nbsp; - `src/modules/tenancy/application/create-project.ts`

&nbsp; - `src/app/api/projects/route.ts`

&nbsp; - `tests/tenancy/create-project.test.ts`

&nbsp; - `tests/tenancy/aor-setup.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - project creation now accepts explicit `crewBuild` (`FULL` / `MEDIUM` / `SLIM`) and persists it on the project record

&nbsp; - project creation now accepts optional `templateId`, loads the selected template, and derives `crewBuild` from that template when present

&nbsp; - conflicting `crewBuild` and template `crew_build` inputs now fail fast with validation errors

&nbsp; - tenancy repository project reads/writes now include `crew_build` and `template_id`

&nbsp; - regression coverage now verifies explicit `crewBuild`, template-derived `crewBuild`, and mismatch rejection

\- Known gap queued for later batches:

&nbsp; - there is still no write surface for managing `project_templates`, so `templateId` currently depends on pre-seeded template data

&nbsp; - there is still no write surface for managing `tenant_memberships`

\- Production behavior changed: yes

### 2026-03-04 - Batch 18
\- Intent: add the Phase 2 tenant-admin write surfaces for `project_templates` first, followed by `tenant_memberships`

\- Files touched:

&nbsp; - `db/migrations/013_project_templates_created_by.sql`

&nbsp; - `src/modules/tenancy/domain/types.ts`

&nbsp; - `src/modules/tenancy/application/index.ts`

&nbsp; - `src/modules/tenancy/application/ports.ts`

&nbsp; - `src/modules/tenancy/application/project-templates.ts`

&nbsp; - `src/modules/tenancy/application/tenant-memberships.ts`

&nbsp; - `src/modules/tenancy/infrastructure/tenancy.repository.ts`

&nbsp; - `src/app/api/project-templates/route.ts`

&nbsp; - `src/app/api/project-templates/[templateId]/route.ts`

&nbsp; - `src/app/api/tenant-memberships/route.ts`

&nbsp; - `tests/tenancy/project-templates.test.ts`

&nbsp; - `tests/tenancy/tenant-memberships.test.ts`

&nbsp; - `tests/tenancy/aor-setup.test.ts`

&nbsp; - `tests/tenancy/create-project.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added tenant-admin application and API write surfaces to create, update, and delete `project_templates`

&nbsp; - template deletes now fail with `ConflictError` when any project still references the template

&nbsp; - added tenant-admin application and API write surfaces to upsert and remove `tenant_memberships`

&nbsp; - tenancy repository and domain contracts now persist template structure metadata and `created_by`

&nbsp; - regression coverage now verifies template create/update/delete authorization and conflict behavior, plus tenant-membership add/remove authorization

\- Known gap queued for later batches:

&nbsp; - the spec-defined template management read surface still requires list/read capabilities with usage counts and summary fields

\- Production behavior changed: yes

### 2026-03-04 - Batch 19
\- Intent: complete WS1 by adding tenancy AOR assignment use cases plus the setup API surface for assignment and deactivation

\- Files touched:

&nbsp; - `src/modules/tenancy/domain/types.ts`

&nbsp; - `src/modules/tenancy/application/index.ts`

&nbsp; - `src/modules/tenancy/application/ports.ts`

&nbsp; - `src/modules/tenancy/application/assign-aor-user.ts`

&nbsp; - `src/modules/tenancy/application/assign-aor-department.ts`

&nbsp; - `src/modules/tenancy/infrastructure/tenancy.repository.ts`

&nbsp; - `src/app/api/projects/[projectId]/aor/route.ts`

&nbsp; - `src/app/api/projects/[projectId]/aor/assignments/route.ts`

&nbsp; - `tests/tenancy/aor-setup.test.ts`

&nbsp; - `tests/tenancy/create-project.test.ts`

&nbsp; - `tests/tenancy/project-templates.test.ts`

&nbsp; - `tests/tenancy/tenant-memberships.test.ts`

&nbsp; - `tests/tenancy/aor-assignments.test.ts`

&nbsp; - `tests/tenancy/aor-assignment-route.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `PHASE2_COMPLETION_REPORT.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added tenancy repository support for persisted `aor_assignments`, assignment lookup/deactivation, and minimal department lookup needed for department-scoped AOR assignment

&nbsp; - added `assignAorUser` / `assignAorDepartment` plus matching deactivation helpers, with reassignment support through `deactivateAssignmentIds`

&nbsp; - added `POST` and `DELETE` setup routes for AOR assignment creation and deactivation under `/api/projects/[projectId]/aor/assignments`

&nbsp; - factored project setup role resolution into the existing AOR route so both setup surfaces authorize `PROJECT_ADMIN` and `TENANT_ADMIN` consistently

&nbsp; - added regression coverage for the new tenancy use cases and route handlers

\- Known gap queued for later batches:

&nbsp; - WS2 department creation, title catalog, and membership flows are still pending, so department-scoped AOR assignments currently depend on existing department rows

&nbsp; - project setup lifecycle immutability is still deferred to WS5-T3, so the new assignment route is not yet blocked after activation

\- Production behavior changed: yes

### 2026-03-04 - Batch 20
\- Intent: complete WS2-T1 by adding department create/list tenancy support and seeding the canonical manager title catalog row on department creation

\- Files touched:

&nbsp; - `src/modules/tenancy/domain/types.ts`

&nbsp; - `src/modules/tenancy/application/ports.ts`

&nbsp; - `src/modules/tenancy/infrastructure/tenancy.repository.ts`

&nbsp; - `src/modules/tenancy/application/create-department.ts`

&nbsp; - `src/modules/tenancy/application/list-departments.ts`

&nbsp; - `tests/tenancy/departments.test.ts`

&nbsp; - `tests/tenancy/aor-assignments.test.ts`

&nbsp; - `tests/tenancy/aor-assignment-route.test.ts`

&nbsp; - `tests/tenancy/aor-setup.test.ts`

&nbsp; - `tests/tenancy/create-project.test.ts`

&nbsp; - `tests/tenancy/project-templates.test.ts`

&nbsp; - `tests/tenancy/tenant-memberships.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added tenancy domain types for `departments` and `department_titles`

&nbsp; - added repository support to save and list departments and to persist seeded `department_titles` rows

&nbsp; - added `createDepartment`, which creates the department and auto-seeds its canonical manager title into `department_titles` with `assignment_layer = MANAGER`

&nbsp; - added `listDepartments`, which returns all departments for a project in name order for setup actors

&nbsp; - added regression coverage for department creation, department listing, and manager-title seeding

\- Known gap queued for later batches:

&nbsp; - WS2-T2 still needs the project setup API surface for department create/list operations

&nbsp; - WS2-T3 and WS2-T4 still need the rest of the department title-catalog and membership workflows

\- Production behavior changed: yes

### 2026-03-04 - Batch 21
\- Intent: complete WS2-T2 by adding the project setup API surface for department create/list operations

\- Files touched:

&nbsp; - `src/modules/tenancy/application/index.ts`

&nbsp; - `src/app/api/projects/[projectId]/departments/route.ts`

&nbsp; - `tests/tenancy/department-route.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added `/api/projects/[projectId]/departments` with `POST` to create a department and `GET` to list departments for the setup phase

&nbsp; - the route delegates department creation/listing to the tenancy application layer and reuses the shared project setup actor-role resolver from the AOR setup route

&nbsp; - added regression coverage for department route create, list, and setup-authorization failure paths

\- Known gap queued for later batches:

&nbsp; - WS2-T3 still needs explicit title-catalog management for departments beyond the seeded manager title row

&nbsp; - WS2-T4 still needs department membership and title assignment workflows

\- Production behavior changed: yes

### 2026-03-04 - Batch 22
\- Intent: complete WS2-T3 by adding department title-catalog management with validated priority and assignment-layer fields

\- Files touched:

&nbsp; - `src/modules/tenancy/application/ports.ts`

&nbsp; - `src/modules/tenancy/infrastructure/tenancy.repository.ts`

&nbsp; - `src/modules/tenancy/application/index.ts`

&nbsp; - `src/modules/tenancy/application/upsert-department-title.ts`

&nbsp; - `src/modules/tenancy/application/list-department-titles.ts`

&nbsp; - `src/app/api/projects/[projectId]/departments/[departmentId]/titles/route.ts`

&nbsp; - `tests/tenancy/department-titles.test.ts`

&nbsp; - `tests/tenancy/aor-assignments.test.ts`

&nbsp; - `tests/tenancy/aor-assignment-route.test.ts`

&nbsp; - `tests/tenancy/aor-setup.test.ts`

&nbsp; - `tests/tenancy/create-project.test.ts`

&nbsp; - `tests/tenancy/departments.test.ts`

&nbsp; - `tests/tenancy/department-route.test.ts`

&nbsp; - `tests/tenancy/project-templates.test.ts`

&nbsp; - `tests/tenancy/tenant-memberships.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added repository support to upsert and list `department_titles`

&nbsp; - added tenancy use cases to upsert a department title and list a department title catalog, including validation for `defaultPriority` and `assignmentLayer`

&nbsp; - added `/api/projects/[projectId]/departments/[departmentId]/titles` with `POST` for upsert and `GET` for list during project setup

&nbsp; - added regression coverage for title upsert validation, title listing, and the nested setup route

\- Known gap queued for later batches:

&nbsp; - WS2-T4 still needs department membership entry, one-department-per-user enforcement, free-agent pool handling, and title assignment workflows

\- Production behavior changed: yes

### 2026-03-04 - Batch 23
\- Intent: complete WS2-T4 by adding department membership entry, one-department-per-user enforcement, free-agent pool handling, and title assignment workflows

\- Files touched:

&nbsp; - `src/modules/tenancy/domain/types.ts`

&nbsp; - `src/modules/tenancy/application/ports.ts`

&nbsp; - `src/modules/tenancy/infrastructure/tenancy.repository.ts`

&nbsp; - `src/modules/tenancy/application/index.ts`

&nbsp; - `src/modules/tenancy/application/add-department-member.ts`

&nbsp; - `src/modules/tenancy/application/assign-department-title.ts`

&nbsp; - `src/modules/tenancy/application/reassign-department-member.ts`

&nbsp; - `src/app/api/projects/[projectId]/departments/[departmentId]/members/route.ts`

&nbsp; - `tests/tenancy/department-memberships.test.ts`

&nbsp; - `tests/tenancy/aor-assignments.test.ts`

&nbsp; - `tests/tenancy/aor-assignment-route.test.ts`

&nbsp; - `tests/tenancy/aor-setup.test.ts`

&nbsp; - `tests/tenancy/create-project.test.ts`

&nbsp; - `tests/tenancy/departments.test.ts`

&nbsp; - `tests/tenancy/department-route.test.ts`

&nbsp; - `tests/tenancy/department-titles.test.ts`

&nbsp; - `tests/tenancy/project-templates.test.ts`

&nbsp; - `tests/tenancy/tenant-memberships.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added tenancy support for `department_memberships`, including repository reads/writes and domain typing

&nbsp; - added `addDepartmentMember` to place users into a department free-agent pool with one-department-per-user enforcement at the application layer

&nbsp; - added `assignDepartmentTitle` to apply a catalog title to a free agent, with role-based restrictions and `superintendent_id` handling for department-lead assignment flows

&nbsp; - added `reassignDepartmentMember` to move an existing member to a different department and clear title/superintendent state back to the free-agent pool

&nbsp; - added `/api/projects/[projectId]/departments/[departmentId]/members` with `POST` for member entry and `PATCH` for title assignment or member reassignment

&nbsp; - added regression coverage for membership entry, one-department conflicts, title assignment, reassignment, and the nested member route

\- Known gap queued for later batches:

&nbsp; - WS3-T1 still needs ticket submission to derive `department_id` and default priority from `department_memberships` and `department_titles`

&nbsp; - the spec distinguishes superintendent-level and working-level assignments more finely than the current `assignment_layer` enum allows, so working-level assignment currently rides the `SUPERINTENDENT` layer path

\- Production behavior changed: yes

### 2026-03-04 - Batch 24
\- Intent: complete WS3-T1 by deriving ticket `department_id` and default priority at submission from department membership/title data, with submit-time manual department fallback

\- Files touched:

&nbsp; - `src/modules/ticket/application/create-ticket.ts`

&nbsp; - `src/modules/ticket/application/submit-ticket.ts`

&nbsp; - `src/modules/ticket/application/ports.ts`

&nbsp; - `src/modules/ticket/infrastructure/ticket.repository.ts`

&nbsp; - `src/app/api/tickets/route.ts`

&nbsp; - `src/app/api/tickets/[ticketId]/submit/route.ts`

&nbsp; - `tests/ticket/submit-ticket.test.ts`

&nbsp; - `tests/ticket/submission-priority.test.ts`

&nbsp; - `tests/ticket/pc-approval.test.ts`

&nbsp; - `tests/ticket/perform-transition.test.ts`

&nbsp; - `tests/ticket/survey-cancel.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - requester draft creation now persists `aor_node_id` and optional `department_id`, leaves `priority = NORMAL`, and defers both priority derivation and whitelist elevation until `DRAFT -> SUBMITTED`

&nbsp; - ticket submission now derives `department_id` from `department_memberships`, resolves title-based default priority through `department_titles`, and overrides to `HIGH` when the requester email is on the project priority whitelist

&nbsp; - requesters without a department membership can now supply `departmentId` at submit time; the submit path validates that the chosen department belongs to the project before finalizing the ticket

&nbsp; - `/api/tickets` now derives requester company context server-side and no longer forces a manual department on draft creation when the requester lacks a department membership

&nbsp; - regression coverage now verifies membership-driven submission priority, submit-time manual department fallback, whitelist override, and the updated repository contract across existing ticket tests

\- Known gap queued for later batches:

&nbsp; - WS3-T2 still needs `DEPARTMENT_MANAGER` and `DEPARTMENT_LEAD` visibility resolution on top of the new department-tagged submission path

\- Production behavior changed: yes

### 2026-03-04 - Batch 25
\- Intent: complete WS3-T2 by enforcing `DEPARTMENT_MANAGER` and `DEPARTMENT_LEAD` ticket visibility at the resolver and repository layers

\- Files touched:

&nbsp; - `src/lib/resolve-visibility.ts`

&nbsp; - `src/modules/ticket/application/ports.ts`

&nbsp; - `src/modules/ticket/infrastructure/ticket.repository.ts`

&nbsp; - `tests/ticket/visibility-repository.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - `VisibilityScope` now carries `departmentId` so repository reads can enforce department-tag filtering for department-scoped roles

&nbsp; - `resolveVisibility` now resolves `departmentId` from `department_memberships` for `DEPARTMENT_MANAGER` and `DEPARTMENT_LEAD`, and also resolves AOR node scope for `DEPARTMENT_LEAD`

&nbsp; - ticket repository reads now apply `t.department_id = actor.department_id` for `DEPARTMENT_MANAGER`

&nbsp; - ticket repository reads now apply `t.department_id = actor.department_id` plus `t.aor_node_id IN (...)` for `DEPARTMENT_LEAD`, with a no-scope fallback of `AND 1 = 0` when department or AOR assignments are missing

&nbsp; - regression coverage now verifies resolver output for `DEPARTMENT_LEAD` and the repository query shape for manager-only department scope, lead department-plus-AOR scope, and lead no-scope fallback

\- Known gap queued for later batches:

&nbsp; - WS4-T1 still needs the dedicated direct-assignment creation path so Variant 2 no longer reuses requester draft semantics

\- Production behavior changed: yes

### 2026-03-04 - Batch 26
\- Intent: complete WS4-T1 by adding a dedicated direct-assignment creation path that starts Variant 2 tickets at `ASSIGNED`

\- Files touched:

&nbsp; - `src/modules/ticket/application/create-direct-assignment-ticket.ts`

&nbsp; - `src/modules/ticket/application/index.ts`

&nbsp; - `src/app/api/tickets/route.ts`

&nbsp; - `tests/ticket/direct-assignment.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added a dedicated direct-assignment creation use case that creates Variant 2 tickets directly in `ASSIGNED`, stamps `assigned_party_chief_id`, optional `assigned_instrument_man_id`, and `survey_lead_id`, and allocates the ticket number immediately

&nbsp; - the direct-assignment path derives requester `department_id` and default priority from `department_memberships` / `department_titles`, with manual department fallback and whitelist override on creation since Variant 2 bypasses `DRAFT -> SUBMITTED`

&nbsp; - direct-assignment creation now emits `ticket.created` and `ticket.assigned` audit events in the same transaction, plus `ticket.priority_set_by_whitelist` when applicable

&nbsp; - `/api/tickets` now supports a Variant 2 branch for `SURVEY_MANAGER` and `SURVEY_SUPERINTENDENT`, requiring `requesterId` and `assignedPartyChiefId` and avoiding the requester draft semantics used by standard approval

&nbsp; - regression coverage now verifies happy-path direct assignment, manual department fallback with whitelist override, unauthorized actor rejection, and missing Party Chief validation

\- Known gap queued for later batches:

&nbsp; - WS4-T2 still needs the remaining direct-assignment authorization and transition alignment across assignment, start, PC approval, delay, and cancellation routes

\- Production behavior changed: yes

### 2026-03-04 - Batch 27
\- Intent: complete WS4-T2 by aligning the existing ticket APIs with active direct-assignment tickets

\- Files touched:

&nbsp; - `src/modules/ticket/application/assign-ticket.ts`

&nbsp; - `src/app/api/tickets/[ticketId]/assign/route.ts`

&nbsp; - `src/modules/workflow/domain/transitions.ts`

&nbsp; - `tests/workflow/transitions.test.ts`

&nbsp; - `tests/ticket/direct-assignment-route-smoke.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - `assignTicket` now supports reassignment of active Variant 2 tickets (`ASSIGNED`, `IN_PROGRESS`, `PENDING_PC_APPROVAL`, `DELAYED`) without trying to replay the initial standard-approval `APPROVED -> ASSIGNED` transition

&nbsp; - direct-assignment reassignment still emits `ticket.assigned` and updates crew assignment context atomically inside the existing transaction boundary

&nbsp; - the assign route now forwards `visibility` into the use case so reassignment honors the same scoped-read authorization path as the other ticket mutation routes

&nbsp; - workflow coverage now asserts the direct-assignment delay and cancellation transitions the active APIs depend on

&nbsp; - added a route-level smoke test that drives a direct-assignment ticket through create, reassign, start, field-cancel request, and Party Chief approval using the real route handlers

\- Known gap queued for later batches:

&nbsp; - WS5-T1 still needs project activation and the build-aware readiness gate before lifecycle guards can be enforced across the ticket APIs

\- Production behavior changed: yes

### 2026-03-04 - Batch 28
\- Intent: complete WS5-T1 by adding the build-aware `SETUP -> ACTIVE` project activation gate and warning acknowledgement flow

\- Files touched:

&nbsp; - `src/modules/tenancy/application/ports.ts`

&nbsp; - `src/modules/tenancy/domain/types.ts`

&nbsp; - `src/modules/tenancy/infrastructure/tenancy.repository.ts`

&nbsp; - `src/modules/tenancy/application/activate-project.ts`

&nbsp; - `src/app/api/projects/[projectId]/activate/route.ts`

&nbsp; - `tests/tenancy/project-activation.test.ts`

&nbsp; - `tests/tenancy/create-project.test.ts`

&nbsp; - `tests/tenancy/tenant-memberships.test.ts`

&nbsp; - `tests/tenancy/aor-assignments.test.ts`

&nbsp; - `tests/tenancy/aor-assignment-route.test.ts`

&nbsp; - `tests/tenancy/aor-setup.test.ts`

&nbsp; - `tests/tenancy/project-templates.test.ts`

&nbsp; - `tests/tenancy/departments.test.ts`

&nbsp; - `tests/tenancy/department-titles.test.ts`

&nbsp; - `tests/tenancy/department-memberships.test.ts`

&nbsp; - `tests/tenancy/department-route.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - surfaced project lifecycle metadata plus a dedicated activation-readiness repository query so the tenancy layer can evaluate setup completeness without pushing SQL into the web layer

&nbsp; - added `activateProject`, which enforces `SETUP -> ACTIVE`, blocks on hard readiness failures, requires explicit acknowledgement when only soft warnings remain, and stamps `activated_at` / `activated_by`

&nbsp; - the activation readiness gate is build-aware: `FULL` projects now require an active `SURVEY_SUPERINTENDENT` AOR assignment in addition to AOR levels, AOR nodes, and at least one `SURVEY_MANAGER`

&nbsp; - added `/api/projects/[projectId]/activate`, reusing the existing setup-role resolver and returning blocked readiness details when activation cannot yet proceed

&nbsp; - regression coverage now verifies hard-gate blocking, warning acknowledgement flow, successful activation metadata stamping, and the route-level conflict payload

\- Known gap queued for later batches:

&nbsp; - WS5-T2 still needs the `ACTIVE -> ARCHIVED` transition and archived-project immutability guards

\- Production behavior changed: yes

### 2026-03-04 - Batch 29
\- Intent: complete WS5-T2 by adding the `ACTIVE -> ARCHIVED` lifecycle transition and tenancy repository guards for archived-project immutability

\- Files touched:

&nbsp; - `src/modules/tenancy/application/ports.ts`

&nbsp; - `src/modules/tenancy/infrastructure/tenancy.repository.ts`

&nbsp; - `src/modules/tenancy/application/archive-project.ts`

&nbsp; - `src/app/api/projects/[projectId]/archive/route.ts`

&nbsp; - `tests/tenancy/project-activation.test.ts`

&nbsp; - `tests/tenancy/create-project.test.ts`

&nbsp; - `tests/tenancy/tenant-memberships.test.ts`

&nbsp; - `tests/tenancy/aor-assignments.test.ts`

&nbsp; - `tests/tenancy/aor-assignment-route.test.ts`

&nbsp; - `tests/tenancy/aor-setup.test.ts`

&nbsp; - `tests/tenancy/project-templates.test.ts`

&nbsp; - `tests/tenancy/departments.test.ts`

&nbsp; - `tests/tenancy/department-titles.test.ts`

&nbsp; - `tests/tenancy/department-memberships.test.ts`

&nbsp; - `tests/tenancy/department-route.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added `archiveProject`, which allows only `TENANT_ADMIN` to move a project from `ACTIVE` to `ARCHIVED` and stamps `archived_at` / `archived_by`

&nbsp; - added `/api/projects/[projectId]/archive` as the dedicated project archival route

&nbsp; - tenancy repository writes for project-scoped setup data now guard against archived projects, making archived projects read-only at the data-access layer for AOR, department, membership, whitelist, and legacy area/subarea mutations

&nbsp; - regression coverage now verifies archive authorization, active-state enforcement, archive metadata stamping, archive-route behavior, and a concrete repository immutability guard

\- Known gap queued for later batches:

&nbsp; - WS5-T3 still needs to apply lifecycle gates across the ticket submission APIs and the remaining setup routes

\- Production behavior changed: yes

### 2026-03-04 - Batch 30
\- Intent: complete WS5-T3 by enforcing project lifecycle gates across the backlog-targeted ticket entry points and setup mutation routes

\- Files touched:

&nbsp; - `src/modules/ticket/application/ports.ts`

&nbsp; - `src/modules/ticket/infrastructure/ticket.repository.ts`

&nbsp; - `src/modules/ticket/application/create-ticket.ts`

&nbsp; - `src/modules/ticket/application/submit-ticket.ts`

&nbsp; - `src/app/api/tickets/route.ts`

&nbsp; - `src/app/api/projects/[projectId]/aor/route.ts`

&nbsp; - `src/app/api/projects/[projectId]/aor/assignments/route.ts`

&nbsp; - `src/app/api/projects/[projectId]/departments/route.ts`

&nbsp; - `src/app/api/projects/[projectId]/departments/[departmentId]/titles/route.ts`

&nbsp; - `src/app/api/projects/[projectId]/departments/[departmentId]/members/route.ts`

&nbsp; - `tests/ticket/project-lifecycle-guards.test.ts`

&nbsp; - `tests/ticket/submit-ticket.test.ts`

&nbsp; - `tests/ticket/submission-priority.test.ts`

&nbsp; - `tests/ticket/direct-assignment.test.ts`

&nbsp; - `tests/ticket/direct-assignment-route-smoke.test.ts`

&nbsp; - `tests/ticket/survey-cancel.test.ts`

&nbsp; - `tests/ticket/perform-transition.test.ts`

&nbsp; - `tests/ticket/pc-approval.test.ts`

&nbsp; - `tests/tenancy/aor-assignment-route.test.ts`

&nbsp; - `tests/tenancy/department-route.test.ts`

&nbsp; - `tests/tenancy/department-titles.test.ts`

&nbsp; - `tests/tenancy/department-memberships.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - ticket repository now exposes project status so ticket lifecycle checks remain in application logic instead of leaking status SQL into the route layer

&nbsp; - requester draft creation now rejects archived projects, and draft submission now rejects both `SETUP` and `ARCHIVED` projects before any status mutation or ticket-number allocation happens

&nbsp; - `/api/tickets` now blocks direct-assignment creation unless the project is `ACTIVE`, while standard requester draft creation remains allowed outside archived projects

&nbsp; - setup mutation routes now share a `SETUP`-only guard, so AOR, department, title-catalog, and department-membership writes are blocked once the project has been activated or archived

&nbsp; - regression coverage now verifies the new ticket lifecycle guard behavior plus setup-route conflict handling after activation

\- Known gap queued for later batches:

&nbsp; - WS6-T1 still needs the tenant-admin template read/list surface with summary fields and usage counts

\- Production behavior changed: yes

### 2026-03-04 - Batch 31
\- Intent: complete WS6-T1 by adding the tenant-admin project-template list surface with summary fields and usage counts

\- Files touched:

&nbsp; - `src/modules/tenancy/application/ports.ts`

&nbsp; - `src/modules/tenancy/infrastructure/tenancy.repository.ts`

&nbsp; - `src/modules/tenancy/application/list-project-templates.ts`

&nbsp; - `src/app/api/project-templates/route.ts`

&nbsp; - `tests/tenancy/project-template-list.test.ts`

&nbsp; - `tests/tenancy/create-project.test.ts`

&nbsp; - `tests/tenancy/tenant-memberships.test.ts`

&nbsp; - `tests/tenancy/aor-assignments.test.ts`

&nbsp; - `tests/tenancy/aor-assignment-route.test.ts`

&nbsp; - `tests/tenancy/aor-setup.test.ts`

&nbsp; - `tests/tenancy/project-templates.test.ts`

&nbsp; - `tests/tenancy/departments.test.ts`

&nbsp; - `tests/tenancy/department-titles.test.ts`

&nbsp; - `tests/tenancy/department-memberships.test.ts`

&nbsp; - `tests/tenancy/department-route.test.ts`

&nbsp; - `tests/tenancy/project-activation.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - tenancy repository now exposes a template list query that returns the spec-defined template-management summary fields: template name, crew build, AOR depth, AOR-level count, discipline-group count, usage count, and created date

&nbsp; - added the `listProjectTemplates` use case, restricted to `TENANT_ADMIN`

&nbsp; - `/api/project-templates` now supports `GET` for the tenant-admin list surface alongside the existing create route

&nbsp; - regression coverage now verifies tenant-admin access, forbidden access for non-admins, and the response shape for template summary rows with usage counts

\- Known gap queued for later batches:

&nbsp; - WS6-T2 still needs to retire the legacy area / subarea write surfaces and update smoke fixtures away from legacy cleanup assumptions

\- Production behavior changed: yes

### 2026-03-04 - Batch 32
\- Intent: complete WS6-T2 by retiring the legacy area / subarea write surfaces and removing smoke cleanup assumptions tied to those tables

\- Files touched:

&nbsp; - `src/app/api/projects/[projectId]/areas/route.ts`

&nbsp; - `src/app/api/projects/[projectId]/areas/[areaId]/subareas/route.ts`

&nbsp; - `src/modules/tenancy/infrastructure/tenancy.repository.ts`

&nbsp; - `src/modules/tenancy/application/create-area.ts` (deleted)

&nbsp; - `src/modules/tenancy/application/create-subarea.ts` (deleted)

&nbsp; - `tests/tenancy/legacy-area-routes.test.ts`

&nbsp; - `tests/ticket/ticket-route-smoke.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - the legacy `/api/projects/[projectId]/areas` and `/api/projects/[projectId]/areas/[areaId]/subareas` write routes now return explicit conflicts directing callers to the AOR setup surface

&nbsp; - removed the obsolete `create-area` and `create-subarea` application entry points

&nbsp; - tenancy repository backstops now reject direct `saveArea` / `saveSubarea` writes with the same retirement guidance

&nbsp; - ticket smoke cleanup no longer assumes legacy `areas` / `subareas` rows need to be deleted, because the smoke fixture is already AOR-native

\- Known gap queued for later batches:

&nbsp; - WS7-T1 still needs attachment metadata/API support for requester uploads on active tickets

\- Production behavior changed: yes

### 2026-03-04 - Batch 33
\- Intent: complete WS7-T1 by adding requester attachment metadata uploads for active tickets with audit emission and route-level validation

\- Files touched:

&nbsp; - `src/modules/attachment/domain/types.ts`

&nbsp; - `src/modules/attachment/application/index.ts`

&nbsp; - `src/modules/attachment/infrastructure/index.ts`

&nbsp; - `src/app/api/tickets/[ticketId]/attachments/route.ts`

&nbsp; - `tests/attachment/attachment-permissions.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added validated attachment metadata input for filename, mime type, storage key, and size bytes

&nbsp; - requester uploads are now allowed only on the requester's own active tickets and are blocked for completed, canceled, or archived-project tickets

&nbsp; - `/api/tickets/[ticketId]/attachments` now performs the ticket/project state check inside the same transaction as the attachment insert and `attachment.uploaded` audit event

&nbsp; - regression coverage now verifies upload success, requester-only authorization, own-ticket enforcement, active-status gating, archived-project blocking, route validation failures, and audit payload contents

\- Known gap queued for later batches:

&nbsp; - WS8-T1 still needs the notification foundation for approver timeout notices and daily vacancy notifications

\- Production behavior changed: yes

### 2026-03-04 - Batch 34
\- Intent: complete WS8-T1 by adding the notification foundation for approver timeout notices and daily vacancy escalation notifications

\- Files touched:

&nbsp; - `src/modules/notification/application/index.ts`

&nbsp; - `src/modules/notification/infrastructure/index.ts`

&nbsp; - `src/modules/audit/domain/types.ts`

&nbsp; - `tests/notification/timeout-and-vacancy.test.ts`

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added notification-module use cases to dispatch 18-hour and 24-hour Survey Manager timeout notices for overdue `SUBMITTED` tickets, with dedupe against existing timeout audit events

&nbsp; - added daily vacancy escalation dispatch for unresolved active `acting_grants`, targeting TENANT_ADMIN and PROJECT_ADMIN recipients after the spec-defined survey-role windows

&nbsp; - added notification infrastructure queries to resolve timeout/vacancy candidates and recipient email metadata from project memberships, tenant memberships, users, tickets, and acting grants

&nbsp; - added the missing timeout audit event types `approver.timeout_warning_sent` and `approver.timeout_unlocked`

&nbsp; - regression coverage now verifies timeout dispatch behavior, vacancy escalation behavior, transport delegation, and repository candidate mapping

\- Known gap queued for later batches:

&nbsp; - WS9-T1 still needs the closure verification pass and final Phase 2 completion reporting

\- Production behavior changed: yes

### 2026-03-04 - Batch 35
\- Intent: complete WS9-T1 by recording the final Phase 2 verification pass and writing the closure artifacts

\- Files touched:

&nbsp; - `PHASE2_STATUS.md`

&nbsp; - `PHASE2_COMPLETION_REPORT.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - marked WS9 completed and updated the resumability log to reflect full Phase 2 closure

&nbsp; - replaced the placeholder completion report with the final closure summary, verification record, and criteria check

&nbsp; - recorded the final green validation state for the repository at Phase 2 close

\- Known gap queued for later batches:

&nbsp; - none within Phase 2 scope; deferred reporting and broader audit surfaces remain excluded by spec

\- Production behavior changed: no

### 2026-03-04 - Batch 36
\- Intent: implement Phase 3 field-first UI surfaces and shared API client integration without moving workflow logic into the frontend

\- Files touched:

&nbsp; - `src/app/layout.tsx`

&nbsp; - `src/app/page.tsx`

&nbsp; - `src/app/globals.css`

&nbsp; - `src/middleware.ts`

&nbsp; - `src/lib/errors.ts`

&nbsp; - `src/lib/contracts/auth.ts`

&nbsp; - `src/lib/contracts/tickets.ts`

&nbsp; - `src/lib/contracts/index.ts`

&nbsp; - `src/lib/apiClient.ts`

&nbsp; - `src/components/ui/*`

&nbsp; - `src/components/forms/*`

&nbsp; - `src/components/aor/*`

&nbsp; - `src/components/tickets/*`

&nbsp; - `src/app/(auth)/*`

&nbsp; - `src/app/(projects)/*`

&nbsp; - `src/app/api/auth/invite/[token]/route.ts`

&nbsp; - `src/app/api/projects/[projectId]/aor/route.ts`

&nbsp; - `src/app/api/tickets/[ticketId]/attachments/route.ts`

&nbsp; - `package.json`

&nbsp; - `PHASE3_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added Phase 3 route-grouped UI shell and mobile-first pages for authentication, requester submission/dashboard/detail, crew work queue, and Party Chief approval queue

&nbsp; - added a typed frontend API client layer (`lib/apiClient.ts` + `lib/contracts`) so pages orchestrate backend calls while components remain presentation-focused

&nbsp; - added field submission stepper flow at `/projects/[projectId]/request/new` that delegates ticket creation/submission and attachment writes to backend APIs

&nbsp; - added requester surfaces for `/projects/[projectId]/my-requests`, `/projects/[projectId]/drafts`, and ticket detail with attachment list/upload UI

&nbsp; - added crew execution surfaces for `/projects/[projectId]/crew/work` and `/projects/[projectId]/crew/approvals` with explicit backend error surfacing on conflicts/forbidden actions

&nbsp; - added missing UI-supporting read APIs: invite token validation (`GET /api/auth/invite/:token`), AOR tree retrieval (`GET /api/projects/[projectId]/aor`), and attachment listing (`GET /api/tickets/[ticketId]/attachments`)

&nbsp; - restored `pnpm test` script to run the repository TypeScript test runner with Node's test harness

&nbsp; - added `PHASE3_STATUS.md` milestone tracker with build/test checkpoints and blocker documentation

\- Known gap queued for later batches:

&nbsp; - forgot-password execution remains blocked by missing backend password-reset endpoint (CLAUDE.md Section 8 currently defines login/register/logout/invite validation only)

&nbsp; - invite acceptance still relies on existing registration flow inputs (`tenantId`, `companyId`) because invite-token registration completion is not yet implemented server-side

\- Production behavior changed: yes

### 2026-03-04 - Batch 37
\- Intent: Phase 3 hardening pass for mobile UX, navigation flow consistency, and shared error-state handling

\- Files touched:

&nbsp; - `src/lib/errors.ts`

&nbsp; - `src/lib/apiClient.ts`

&nbsp; - `src/app/globals.css`

&nbsp; - `src/components/ui/project-nav.tsx`

&nbsp; - `src/components/ui/index.ts`

&nbsp; - `src/app/(projects)/projects/[projectId]/layout.tsx`

&nbsp; - `src/app/(projects)/projects/[projectId]/page.tsx`

&nbsp; - `src/app/(auth)/login/page.tsx`

&nbsp; - `src/app/(auth)/register/page.tsx`

&nbsp; - `src/app/(auth)/invite/[token]/page.tsx`

&nbsp; - `src/app/(projects)/projects/[projectId]/request/new/page.tsx`

&nbsp; - `src/app/(projects)/projects/[projectId]/(requester)/my-requests/page.tsx`

&nbsp; - `src/app/(projects)/projects/[projectId]/(requester)/drafts/page.tsx`

&nbsp; - `src/app/(projects)/projects/[projectId]/(requester)/tickets/[ticketId]/page.tsx`

&nbsp; - `src/app/(projects)/projects/[projectId]/(crew)/crew/work/page.tsx`

&nbsp; - `src/app/(projects)/projects/[projectId]/(crew)/crew/approvals/page.tsx`

&nbsp; - `PHASE3_STATUS.md`

&nbsp; - `CODEX.md`

\- Behavior added:

&nbsp; - added resilient API response parsing and a shared `getErrorMessage` helper so UI surfaces show consistent actionable error text for both API and unexpected failures

&nbsp; - hardened mobile-first usability by increasing touch target sizes, ensuring form controls keep 16px input sizing, and enabling horizontal tab scrolling on narrow screens

&nbsp; - added project-level active navigation highlighting plus default route redirect from `/projects/[projectId]` to `/projects/[projectId]/my-requests`

&nbsp; - improved requester dashboard safety by limiting quick-cancel controls to cancellable statuses, adding confirmation prompts, and preventing double-submit with per-ticket busy state

&nbsp; - added retry/refresh controls on key requester and crew queue screens to improve field recovery when intermittent backend/network errors occur

&nbsp; - tightened request-submission client flow by trimming payload text fields and requiring step completion before allowing forward navigation

\- Known gap queued for later batches:

&nbsp; - forgot-password remains informational only until a backend reset endpoint is implemented

&nbsp; - invite acceptance still requires manual company ID on registration because invite-token completion API is not yet available

\- Production behavior changed: yes

### 2026-03-04 - Batch 38
- Intent: add regression coverage for Phase 3 read APIs (invite token validation, project AOR read, ticket attachment listing) using injectable route handlers
- Files touched:
  - `src/app/api/auth/invite/[token]/route.ts`
  - `src/app/api/projects/[projectId]/aor/route.ts`
  - `src/app/api/tickets/[ticketId]/attachments/route.ts`
  - `tests/identity/invite-token-route.test.ts`
  - `tests/tenancy/aor-read-route.test.ts`
  - `tests/attachment/attachment-read-route.test.ts`
  - `CODEX.md`
- Behavior added: new exported `handleGet...` route handlers with dependency injection for deterministic tests; GET route responses and error mapping are now regression-tested for success and failure paths
- Known gap queued for later batches: none discovered in this slice
- Production behavior changed: no
### 2026-03-04 - Batch 39
- Intent: add regression tests for API client request and error parsing behavior introduced in Phase 3 hardening
- Files touched:
  - `tests/lib/api-client.test.ts`
  - `CODEX.md`
- Behavior added: coverage for success payload parsing, typed API error handling, plain-text non-JSON error handling, and empty-body fallback message handling in `apiClient`
- Known gap queued for later batches: none discovered in this slice
- Production behavior changed: no
