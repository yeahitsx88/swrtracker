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
### 2026-03-04 - Batch 40
- Intent: tighten invite-to-register UX by preserving invite context and preventing tenant/email drift on registration
- Files touched:
  - `src/app/(auth)/invite/[token]/page.tsx`
  - `src/app/(auth)/register/page.tsx`
  - `CODEX.md`
- Behavior added: invite continuation now forwards `inviteToken`; registration locks invite-prefilled tenant/email fields and shows explicit guidance that company ID is still required
- Known gap queued for later batches: anonymous tenant/company lookup endpoints are not available, so non-invite registration still requires manual tenant/company IDs
- Production behavior changed: yes

### 2026-03-04 - Batch 45
- Intent: provide a quick local preview page that renders the requester dashboard styling without requiring live backend data
- Files touched:
  - `src/app/preview/page.tsx`
- Behavior added:
  - introduced `/preview` so stakeholders can open the existing ticket cards, badges, and navigation shell with canned tickets before the API is wired up
  - added descriptive copy that explains the page uses static data and serves as a brand/style check for fonts, colors, and layout elements
- Known gap queued for later batches:
  - the preview still relies on hardcoded ticket records; linking it to real tenant/project data and navigation flows remains future work
- Production behavior changed: no
### 2026-03-04 - Batch 41
- Intent: sync Phase 3 status tracking with current validated baseline and delivered authentication UX hardening
- Files touched:
  - `PHASE3_STATUS.md`
  - `CODEX.md`
- Behavior added: none (tracking/documentation update only)
- Known gap queued for later batches: none discovered in this slice
- Production behavior changed: no
### 2026-03-04 - Batch 42
- Intent: add identity module regression coverage for user creation and password authentication flows
- Files touched:
  - `tests/identity/identity-auth.test.ts`
  - `CODEX.md`
- Behavior added: tests now verify password hashing on create, duplicate-email conflict handling, successful LOCAL authentication token issuance, invalid-credential rejection, and SSO-password-login rejection
- Known gap queued for later batches: none discovered in this slice
- Production behavior changed: no
### 2026-03-04 - Batch 43
- Intent: add route-level regression coverage for auth login/register surfaces with dependency-injected handlers
- Files touched:
  - `src/app/api/auth/login/route.ts`
  - `src/app/api/auth/register/route.ts`
  - `tests/identity/auth-routes.test.ts`
  - `CODEX.md`
- Behavior added: exported `handlePostLogin`/`handlePostRegister` handlers with injectable dependencies; tests now cover success, validation, forbidden domain, unauthorized login, and login cookie issuance
- Known gap queued for later batches: none discovered in this slice
- Production behavior changed: no
### 2026-03-04 - Batch 44
- Intent: close the Phase 3 forgot-password blocker by implementing end-to-end password reset APIs, token persistence, and auth UI flow
- Files touched:
  - `db/migrations/014_password_reset_tokens.sql`
  - `src/modules/identity/application/password-reset.ts`
  - `src/modules/identity/application/index.ts`
  - `src/modules/identity/infrastructure/user.repository.ts`
  - `src/app/api/auth/forgot-password/route.ts`
  - `src/app/api/auth/reset-password/route.ts`
  - `src/lib/contracts/auth.ts`
  - `src/lib/apiClient.ts`
  - `src/app/(auth)/forgot-password/page.tsx`
  - `src/app/(auth)/reset-password/page.tsx`
  - `src/middleware.ts`
  - `tests/identity/password-reset.test.ts`
  - `tests/identity/password-reset-routes.test.ts`
  - `PHASE3_STATUS.md`
  - `CODEX.md`
- Behavior added: forgot-password now creates expiring one-time reset tokens for LOCAL users and reset-password consumes valid tokens to rotate password hash; UI now supports reset request and reset completion; middleware allows unauthenticated access to `/reset-password`
- Known gap queued for later batches: reset-link delivery transport is environment-dependent (debug token is exposed only outside production), so production mail transport integration can be layered without changing API contracts
- Production behavior changed: yes
### 2026-03-04 - Batch 46
- Intent: start Phase 4 with Milestone 0 architecture review artifacts and execution tracker setup under the Lead Agent plan
- Files touched:
  - `PHASE4_STATUS.md`
  - `CODEX.md`
- Behavior added: added Phase 4 milestone tracker with baseline validation status, architecture validation summary, dependency map, and phased execution breakdown for Milestones 1-8
- Known gap queued for later batches: `pnpm tsc --noEmit` is currently blocked by pre-existing Next.js route helper exports (`handlePostLogin`, `handlePostRegister`, `resolveProjectSetupActorRole`) violating route-module export constraints
- Production behavior changed: no
### 2026-03-04 - Batch 47
- Intent: clear the Phase 4 typecheck blocker by removing invalid named exports from Next.js route modules while preserving injectable handler test coverage
- Files touched:
  - `src/app/api/auth/login/route.ts`
  - `src/app/api/auth/login/handler.ts` (new)
  - `src/app/api/auth/register/route.ts`
  - `src/app/api/auth/register/handler.ts` (new)
  - `src/app/api/projects/[projectId]/aor/route.ts`
  - `src/app/api/projects/[projectId]/aor/read-handler.ts` (new)
  - `src/app/api/projects/[projectId]/aor/shared.ts` (new)
  - `src/app/api/projects/[projectId]/activate/route.ts`
  - `src/app/api/projects/[projectId]/aor/assignments/route.ts`
  - `src/app/api/projects/[projectId]/departments/route.ts`
  - `src/app/api/projects/[projectId]/departments/[departmentId]/titles/route.ts`
  - `src/app/api/projects/[projectId]/departments/[departmentId]/members/route.ts`
  - `tests/identity/auth-routes.test.ts`
  - `tests/tenancy/aor-read-route.test.ts`
  - `CODEX.md`
- Behavior added: route modules now export only allowed Next route symbols, while route handlers/shared setup guards moved to sibling modules for reuse and direct test injection
- Known gap queued for later batches: none discovered in this slice
- Production behavior changed: no
### 2026-03-04 - Batch 48
- Intent: execute and close Phase 4 milestones (workflow kernel isolation, worker/runtime readiness, observability, diagnostics, and regression expansion)
- Files touched:
  - `src/modules/workflow/application/kernel.ts` (new)
  - `src/modules/workflow/application/index.ts` (new)
  - `src/modules/ticket/application/shared.ts`
  - `src/modules/notification/application/worker.ts` (new)
  - `src/modules/notification/infrastructure/job-run.repository.ts` (new)
  - `src/modules/notification/infrastructure/index.ts`
  - `src/lib/email.ts` (new)
  - `src/lib/observability.ts` (new)
  - `src/workers/notification-worker.ts` (new)
  - `src/workers/notification-worker-loop.ts` (new)
  - `src/app/api/auth/forgot-password/route.ts`
  - `src/app/api/ops/diagnostics/handler.ts` (new)
  - `src/app/api/ops/diagnostics/route.ts` (new)
  - `src/app/api/health/route.ts`
  - `db/migrations/015_background_job_runs.sql` (new)
  - `package.json`
  - `Dockerfile` (new)
  - `.dockerignore` (new)
  - `docker-compose.yml` (new)
  - `DEPLOYMENT.md` (new)
  - `src/app/preview/page.tsx` (deleted)
  - `tests/identity/password-reset-routes.test.ts`
  - `tests/notification/worker-cycle.test.ts` (new)
  - `tests/ops/diagnostics-route.test.ts` (new)
  - `tests/workflow/kernel.test.ts` (new)
  - `PHASE4_STATUS.md`
  - `CODEX.md`
- Behavior added:
  - centralized workflow transition execution under a workflow-kernel application module used by ticket transition helpers
  - introduced stateless notification worker cycle orchestration with persisted run outcomes in `background_job_runs`
  - added transport-abstracted email dispatch and wired forgot-password token delivery + notification email transport
  - added deploy/runtime assets for single-command container startup (`docker compose up --build`) with dedicated web + worker services
  - introduced structured JSON observability logging carrying `tenant_id`, `ticket_id`, `actor_id`, and `event_type`
  - expanded regression coverage for workflow kernel transitions, notification worker cycle behavior, diagnostics route authorization/shape, and password-reset email dispatch hook
  - retired preview/mock-only UI route and added tenant-admin operational diagnostics API surface
- Known gap queued for later batches:
  - worker persistence migration (`015_background_job_runs.sql`) was added but not executed in this session (requires database migration run in target environment)
- Production behavior changed: yes
### 2026-03-05 - Batch 49
- Intent: execute post-Phase-4 immediate operational checks (migrate, compose startup, health/diagnostics verification) and unblock newly surfaced Next route export violations
- Files touched:
  - `.env` (created from `.env.local` to satisfy compose `env_file` contract)
  - `src/app/api/auth/forgot-password/handler.ts` (new)
  - `src/app/api/auth/forgot-password/route.ts`
  - `src/app/api/auth/reset-password/handler.ts` (new)
  - `src/app/api/auth/reset-password/route.ts`
  - `src/app/api/auth/invite/[token]/handler.ts` (new)
  - `src/app/api/auth/invite/[token]/route.ts`
  - `tests/identity/password-reset-routes.test.ts`
  - `tests/identity/invite-token-route.test.ts`
  - `CODEX.md`
- Behavior added:
  - applied migration `015_background_job_runs.sql` successfully using `.env.local`
  - split additional auth route helper exports into handler modules to satisfy Next route export constraints in production builds
  - kept local validation green after adjustments (`pnpm tsc --noEmit`, `pnpm test`)
- Known gap queued for later batches:
  - `docker compose up --build -d` still fails because additional route modules export non-Next symbols (project templates, project activation/archive, AOR assignments, departments, department titles/members, ticket attachments)
  - `/api/health` and `/api/ops/diagnostics` runtime verification in containers is blocked until those route-export violations are fully normalized
- Production behavior changed: yes
### 2026-03-05 - Batch 50
- Intent: recover broken route-handler split, unblock containerized production build, and execute immediate operational checks from exit brief
- Files touched:
  - `src/app/api/projects/[projectId]/activate/handler.ts` (new)
  - `src/app/api/projects/[projectId]/archive/handler.ts` (new)
  - `src/app/api/projects/[projectId]/aor/assignments/handler.ts` (new)
  - `src/app/api/projects/[projectId]/departments/handler.ts` (new)
  - `src/app/api/projects/[projectId]/departments/[departmentId]/titles/handler.ts` (new)
  - `src/app/api/projects/[projectId]/departments/[departmentId]/members/handler.ts` (new)
  - `src/app/api/tickets/[ticketId]/attachments/handler.ts` (new)
  - `src/app/(auth)/login/page.tsx`
  - `src/app/(auth)/register/page.tsx`
  - `src/app/(auth)/reset-password/page.tsx`
  - `.env`
  - `CODEX.md`
- Behavior added:
  - restored missing API handler modules so route wrappers compile and tests can import handler exports again
  - aligned setup-role helper imports to shared AOR module (`aor/shared`) to keep Next route modules thin
  - wrapped auth pages using `useSearchParams()` in `Suspense` to satisfy Next.js prerender/build requirements in containerized production builds
  - configured compose runtime DB host for containers (`host.docker.internal`) so app health checks can reach Postgres
  - completed immediate operational checks: `docker compose up --build -d` succeeds, `/api/health` returns 200, and `/api/ops/diagnostics` returns 200 with TENANT_ADMIN cookie auth
- Known gap queued for later batches:
  - diagnostics endpoint validation required creating a local `TENANT_ADMIN` membership record in this environment because `tenant_memberships` was empty
- Production behavior changed: yes
### 2026-03-05 - Batch 51
- Intent: run a full 4-week Production Chaos Monkeys simulation and deliver consolidated multi-tenant stress-test findings/reporting
- Files touched:
  - `CHAOS_REPORT.md`
  - `CODEX.md`
- Behavior added: added a comprehensive simulated chaos report covering 120 users across 3 tenants/6 projects, 18,000 requests, scenarios A-E, metrics, severity-ranked findings with reproduction steps, and a top-10 beta hardening backlog
- Known gap queued for later batches: this session produced a simulation report only; no live high-volume execution harness exists yet to replay the same chaos profile automatically against deployed environments
- Production behavior changed: no

### 2026-03-05 - Batch 52
- Intent: rerun and refresh Production Chaos Monkeys simulation artifact with full required sections, updated anomaly ledger, and explicit assumptions
- Files touched:
  - `CHAOS_REPORT.md`
  - `CODEX.md`
- Behavior added: replaced chaos report with a complete 4-week multi-tenant simulation summary including scenario A-E coverage, required KPI tables, and severity-sorted findings with repro steps and error/action trails where applicable
- Known gap queued for later batches: simulation remains modeled/offline; no executable chaos harness yet drives these scenarios end-to-end against a live deployment
- Production behavior changed: no

### 2026-03-05 - Batch 53
- Intent: establish Phase 4 hardening pipeline control document and complete Phase A intake/spec handoff for Step 1 security boundary work
- Files touched:
  - `HARDENING_PIPELINE.md` (new)
  - `CODEX.md`
- Behavior added: introduced a sequential multi-engineer hardening pipeline spec with global invariants, workstream gates, intake-derived success criteria, and a strict Step 1 (Security Boundary) SPEC/HANDOFF contract including implementation/test/acceptance boundaries
- Known gap queued for later batches: authoritative source filenames requested for intake (`SWRTracker_Phase4_Executive_Summary.md`, `SWRTracker_Hardening_Roadmap.md`) were not found in repository or git history; intake currently anchored to existing Phase 4 artifacts (`CHAOS_REPORT.md`, stress audit, `PHASE4_STATUS.md`)
- Production behavior changed: no

### 2026-03-05 - Batch 54
- Intent: re-run Phase A intake/spec handoff using newly added authoritative sources and tighten Step 1 handoff contracts
- Files touched:
  - `HARDENING_PIPELINE.md`
  - `CODEX.md`
- Behavior added:
  - updated intake to use `SWRTracker_Phase4_Executive_Summary.md` and `SWRTracker_Hardening_Roadmap.md` as primary authority, with in-repo stress artifacts as supporting evidence
  - aligned pipeline sequencing to roadmap phases and clarified Step 1 mapping to Roadmap Phase 1 deliverables
  - upgraded Step 1 handoff to explicitly include `Contract Notes`, `PR Checklist`, and `Edge-Case Additions` sections while preserving strict stop-the-line contract-revision rules
- Known gap queued for later batches: none new; remaining implementation gaps are intentionally deferred to sequential Phase B execution
- Production behavior changed: no

### 2026-03-05 - Batch 55
- Intent: execute Phase B Step 1 (Security Boundary) from hardening pipeline handoff with tenant mutation guards, immediate session revocation plumbing, and regression coverage
- Files touched:
  - `db/migrations/016_session_version_hardening.sql` (new)
  - `src/shared/errors.ts`
  - `src/lib/api-error.ts`
  - `src/lib/auth.ts`
  - `src/lib/get-tenant-role.ts`
  - `src/lib/get-project-role.ts`
  - `src/lib/ticket-route-helpers.ts`
  - `src/modules/identity/domain/types.ts`
  - `src/modules/identity/infrastructure/user.repository.ts`
  - `src/modules/identity/application/authenticate.ts`
  - `src/modules/tenancy/application/ports.ts`
  - `src/modules/tenancy/application/add-project-member.ts`
  - `src/modules/tenancy/application/tenant-memberships.ts`
  - `src/modules/tenancy/infrastructure/tenancy.repository.ts`
  - `src/app/api/companies/route.ts`
  - `src/app/api/projects/route.ts`
  - `src/app/api/tenant-memberships/route.ts`
  - `src/app/api/tickets/route.ts`
  - `src/app/api/ops/diagnostics/handler.ts`
  - `src/app/api/project-templates/handler.ts`
  - `src/app/api/project-templates/[templateId]/route.ts`
  - `src/app/api/projects/[projectId]/members/route.ts`
  - `src/app/api/projects/[projectId]/whitelist/route.ts`
  - `src/app/api/projects/[projectId]/aor/shared.ts`
  - `src/app/api/projects/[projectId]/aor/route.ts`
  - `src/app/api/projects/[projectId]/aor/read-handler.ts`
  - `src/app/api/projects/[projectId]/aor/assignments/handler.ts`
  - `src/app/api/projects/[projectId]/departments/handler.ts`
  - `src/app/api/projects/[projectId]/departments/[departmentId]/titles/handler.ts`
  - `src/app/api/projects/[projectId]/departments/[departmentId]/members/handler.ts`
  - `src/app/api/projects/[projectId]/activate/handler.ts`
  - `src/app/api/projects/[projectId]/archive/handler.ts`
  - `tests/identity/session-auth.test.ts` (new)
  - `tests/lib/get-tenant-role.test.ts`
  - `tests/tenancy/add-project-member-security.test.ts` (new)
  - `tests/ops/diagnostics-route.test.ts`
  - `tests/tenancy/aor-assignment-route.test.ts`
  - `tests/tenancy/aor-read-route.test.ts`
  - `tests/tenancy/department-memberships.test.ts`
  - `tests/tenancy/department-route.test.ts`
  - `tests/tenancy/department-titles.test.ts`
  - `tests/tenancy/project-activation.test.ts`
  - `tests/tenancy/project-template-list.test.ts`
  - `tests/ticket/direct-assignment-route-smoke.test.ts`
  - `tests/ticket/project-lifecycle-guards.test.ts`
  - `HARDENING_PIPELINE.md`
  - `CODEX.md`
- Behavior added:
  - enforced tenant-boundary checks for project membership and tenant membership mutations with explicit security error code `SEC_TENANT_BOUNDARY_VIOLATION`
  - added `users.session_version` schema support and session-version bump on tenant/project role mutations to invalidate stale privileged sessions
  - added active-session validation (`sessionVersion` + `deactivated_at`) to auth/role resolution path for immediate revocation semantics
  - extended API error model to include machine-readable `code` and `correlationId`
  - added Step 1 regression tests for cross-tenant mutation blocking plus session revocation edge cases
- Known gap queued for later batches:
  - not all authenticated read-only routes are forced through explicit active-session checks yet; high-risk mutation and role-gated paths are covered in this step
  - idempotency, concurrency 409 determinism, and orphan workflow remediations remain deferred to Steps 2-4 by design
- Production behavior changed: yes

### 2026-03-05 - Batch 56
- Intent: execute Phase B Step 2 (Concurrency/State Machine) with optimistic locking, deterministic stale-state conflicts, and regression coverage
- Files touched:
  - `db/migrations/017_ticket_row_version_concurrency.sql` (new)
  - `src/modules/ticket/application/ports.ts`
  - `src/modules/ticket/domain/types.ts`
  - `src/modules/ticket/infrastructure/ticket.repository.ts`
  - `src/modules/workflow/application/kernel.ts`
  - `src/modules/ticket/application/shared.ts`
  - `src/modules/ticket/application/assign-ticket.ts`
  - `src/modules/ticket/application/approve-pc-status.ts`
  - `src/modules/ticket/application/reject-pc-status.ts`
  - `src/modules/ticket/application/submit-ticket.ts`
  - `src/modules/ticket/application/request-survey-cancel.ts`
  - `tests/workflow/kernel.test.ts`
  - `tests/ticket/perform-transition.test.ts`
  - `tests/ticket/submit-ticket.test.ts`
  - `HARDENING_PIPELINE.md`
  - `CODEX.md`
- Behavior added:
  - added `tickets.row_version` optimistic concurrency primitive and increment-on-write semantics
  - transition write paths now apply expected status and expected row-version guards at the repository layer
  - stale transitions now fail deterministically with `WORKFLOW_STALE_STATE` instead of ambiguous outcomes
  - workflow kernel/shared transition helpers and direct transition use-cases now forward expected-state guards consistently
  - regression tests now verify stale-state conflicts and confirm rejected stale writes do not append audit events
- Known gap queued for later batches:
  - idempotency keys/duplicate suppression and structured duplicate-response semantics are intentionally deferred to Step 3 scope
- Production behavior changed: yes

### 2026-03-05 - Batch 57
- Intent: execute Phase B Step 3 (Idempotency/API Reliability) with persisted idempotency keys, duplicate suppression, and structured duplicate-conflict semantics
- Files touched:
  - `db/migrations/018_api_idempotency_ledger.sql` (new)
  - `src/lib/idempotency.ts` (new)
  - `src/app/api/tickets/route.ts`
  - `src/app/api/tickets/[ticketId]/assign/route.ts`
  - `src/app/api/tickets/[ticketId]/requester-cancel/route.ts`
  - `src/app/api/tickets/[ticketId]/field-cancel/route.ts`
  - `src/app/api/tickets/[ticketId]/survey-cancel/route.ts`
  - `tests/lib/idempotency.test.ts` (new)
  - `tests/ticket/idempotency-routes.test.ts` (new)
  - `tests/ticket/direct-assignment-route-smoke.test.ts`
  - `tests/ticket/project-lifecycle-guards.test.ts`
  - `HARDENING_PIPELINE.md`
  - `CODEX.md`
- Behavior added:
  - create/assign/cancel mutations now require `Idempotency-Key` and persist scoped request hashes + committed responses
  - duplicate keyed retries now replay cached success responses without running mutation logic a second time
  - same-key/different-payload reuse now returns deterministic `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`
  - idempotency in-progress and validation failures now return structured machine-readable codes
  - idempotency replay/mismatch/in-progress paths emit structured observability events
- Known gap queued for later batches:
  - idempotency ledger retention/TTL cleanup is still deferred (P1 operational backlog)
- Production behavior changed: yes

### 2026-03-05 - Batch 58
- Intent: execute Phase B Step 4 (Workflow Integrity/Offboarding) with orphaned-workflow detection, deterministic reassignment, and SLA escalation
- Files touched:
  - `src/modules/notification/application/index.ts`
  - `src/modules/notification/application/worker.ts`
  - `src/modules/notification/infrastructure/index.ts`
  - `src/workers/notification-worker.ts`
  - `tests/notification/timeout-and-vacancy.test.ts`
  - `tests/notification/worker-cycle.test.ts`
  - `HARDENING_PIPELINE.md`
  - `CODEX.md`
- Behavior added:
  - notification repository now detects active tickets whose assigned owners are deactivated (workflow orphans)
  - worker cycle now performs deterministic orphan recovery by reassigning to active `PROJECT_ADMIN` fallback with row-version guard
  - unresolved orphaned tickets now trigger SLA-based escalation notifications (`workflow.orphan_escalation`)
  - orphan reassignment/escalation append audit signals using existing event contracts (`ticket.assigned`, `ticket.unassigned`)
  - worker outputs and logs now include orphan recovery counters (`orphanReassignedCount`, `orphanEscalatedCount`, `orphanUnresolvedCount`)
- Known gap queued for later batches:
  - fallback hierarchy is currently `PROJECT_ADMIN` only; role-aware multi-tier fallback preferences remain a P1 enhancement
- Production behavior changed: yes

### 2026-03-05 - Batch 59
- Intent: execute Phase B Step 5 (Observability/Chaos Certification) with correlation-ID propagation, hardening diagnostics metrics, and final certification reporting
- Files touched:
  - `src/lib/correlation.ts` (new)
  - `src/lib/observability.ts`
  - `src/lib/api-error.ts`
  - `src/app/api/tickets/route.ts`
  - `src/app/api/tickets/[ticketId]/assign/route.ts`
  - `src/app/api/tickets/[ticketId]/requester-cancel/route.ts`
  - `src/app/api/tickets/[ticketId]/field-cancel/route.ts`
  - `src/app/api/tickets/[ticketId]/survey-cancel/route.ts`
  - `src/app/api/ops/diagnostics/route.ts`
  - `src/app/api/ops/diagnostics/handler.ts`
  - `src/modules/notification/application/worker.ts`
  - `tests/lib/correlation.test.ts` (new)
  - `tests/ops/diagnostics-route.test.ts`
  - `HARDENING_PIPELINE.md`
  - `CODEX.md`
- Behavior added:
  - critical hardening routes now run inside request correlation context and emit `x-correlation-id` response headers
  - structured API errors now reuse request correlation context for `error.correlationId`
  - structured logs now include `correlation_id`, including notification worker runs (seeded by runId)
  - ops diagnostics now exposes additive hardening metrics (`orphanWorkflowCandidates`, `idempotencyLedger24h`)
  - certification report added to hardening pipeline with explicit pass/fail metrics tied to Phase 4 objectives
- Known gap queued for later batches:
  - full-route correlation wrapping is intentionally focused on critical hardening paths; secondary read-only routes can be migrated in a follow-up observability sweep
- Production behavior changed: yes
### 2026-03-05 - Batch 60
- Intent: close Zachry form capability gaps by adding per-project lead-time configuration, server-enforced configurable submit validation, requester/admin UI updates, and coordination-field persistence without regressing attachments.
- Files touched:
  - `db/migrations/020_project_request_config_and_ticket_coordination.sql` (new)
  - `src/modules/ticket/domain/lead-time-policy.ts` (new)
  - `src/modules/ticket/domain/types.ts`
  - `src/modules/ticket/application/ports.ts`
  - `src/modules/ticket/application/submit-ticket.ts`
  - `src/modules/ticket/application/create-ticket.ts`
  - `src/modules/ticket/application/create-direct-assignment-ticket.ts`
  - `src/modules/ticket/infrastructure/ticket.repository.ts`
  - `src/modules/tenancy/application/project-request-config.ts` (new)
  - `src/modules/tenancy/application/index.ts`
  - `src/modules/tenancy/domain/types.ts`
  - `src/modules/tenancy/infrastructure/tenancy.repository.ts`
  - `src/app/api/projects/[projectId]/request-config/handler.ts` (new)
  - `src/app/api/projects/[projectId]/request-config/route.ts` (new)
  - `src/app/api/tickets/route.ts`
  - `src/lib/contracts/projects.ts` (new)
  - `src/lib/contracts/tickets.ts`
  - `src/lib/contracts/index.ts`
  - `src/lib/apiClient.ts`
  - `src/app/(projects)/projects/[projectId]/request/new/page.tsx`
  - `src/app/(projects)/projects/[projectId]/(admin)/admin/page.tsx`
  - `src/components/tickets/ticket-details.tsx`
  - `tests/ticket/lead-time-policy.test.ts` (new)
  - `tests/tenancy/project-request-config.test.ts` (new)
  - `tests/tenancy/project-request-config-route.test.ts` (new)
  - `tests/attachment/attachment-read-route.test.ts`
  - `tests/ticket/submit-ticket.test.ts`
  - `tests/ticket/ticket-repository-save.test.ts`
  - `tests/ticket/idempotency-routes.test.ts`
  - `tests/ticket/project-lifecycle-guards.test.ts`
  - `tests/ticket/direct-assignment-route-smoke.test.ts`
  - `tests/ticket/ticket-route-smoke.ts`
  - `docs/worklogs/IMPLEMENTATION_SPINE.md` (new)
  - `docs/worklogs/GAP_CLOSURE_WORKLOG.md` (new)
  - `docs/worklogs/LEAD_DECISION_LOG.md` (new)
  - `docs/worklogs/EDGE_CASE_REGISTER.md` (new)
  - `docs/worklogs/EXEC_SUMMARY.md` (new)
  - `docs/CODEX.md`
- Behavior added:
  - project-level request policy controls now support enabling/disabling lead-time enforcement and setting lead-time days per project
  - submit-ticket validation now uses project configuration (server-authoritative) instead of a hard-coded 48-hour window
  - requester ticket creation now requires and persists `fieldContact` + `fieldChannel`; ticket details display both fields
  - requester UI date picker now applies configured min-date when enforcement is enabled; admin UI can view/update project request configuration
  - API contracts and client methods now include project request-config retrieval/update and expanded create-ticket payload fields
- Known gap queued for later batches:
  - add explicit timezone/day-boundary hardening tests for submit-time lead-time checks
  - add max-length constraints for `fieldContact`/`fieldChannel` at API/domain boundaries
- Production behavior changed: yes

### 2026-09-24 — ADCQ-260923-001 requirements record
- Intent: record the user-approved product-rule replacement and selected `phase5` continuation baseline in product-owned decision and requirements sources.
- Files touched: `docs/REQUIREMENTS_ADCQ-260923-001.md`, `docs/worklogs/LEAD_DECISION_LOG.md`, `docs/CLAUDE.md`, `docs/PROJECT_VISION_v2.md`, `docs/README.md`, `docs/CODEX.md`.
- Behavior added/changed: documentation authority and provenance only; no runtime or schema change.
- Known gaps queued: detailed design decisions, historical-data compatibility, isolated database lifecycle verification, and pilot acceptance.
- Production behavior changed: no.

### 2026-09-24 — ADCQ-260923-001 Gate A baseline
- Intent: make the supported Node 22 toolchain reproducible and contain the old route smoke test before any new workflow or migration work.
- Files touched: `.node-version`, `package.json`, `pnpm-workspace.yaml`, `Dockerfile`, `scripts/run-tests.ts`, `tests/ticket/ticket-route-smoke.ts`, `docs/BASELINE_TESTING.md`, `docs/README.md`, `docs/CODEX.md`.
- Behavior added/changed: dependency build scripts are explicitly allowed for the declared native packages; `pnpm test` runs the existing suite in one process on Node 22; `pnpm smoke:ticket` requires an explicitly identified disposable database, uses a pinned client for fixture setup, and leaves deletion to disposal of the temporary cluster. No product workflow, schema, or API behavior changed.
- Validation: clean Node 22.23.3/pnpm 11.19.0 install, TypeScript, 216/216 tests, and Next build passed. PostgreSQL 15.19 applied migrations 001–021 to an empty temporary database and skipped them on rerun. The contained route smoke passed through assignment with persisted state and audit events; the missing-guard run failed before mutation.
- Known gaps queued: no Amelia workflow replay, historical-data compatibility, real external identities, email delivery, attachment bytes, reporting, deployment inventory, Docker image build, or pilot acceptance.
- Production behavior changed: no.

### 2026-09-24 — ADCQ-260923-001 Gate B1 data and access foundation
- Intent: implement the user-authorized first local beta build package while keeping GitHub publication deferred.
- Files touched: migration 022; identity registration and invite routes/contracts; company-authority routes and repository; ticket visibility and attachment metadata reads; registration UI; access smoke and related tests; `package.json`; `docs/BASELINE_TESTING.md`; this record.
- Behavior added/changed: registration requires a single-use, company-bound invite; central or project IT can issue subcontractor requester invites and grant/revoke project-scoped company authority; an authority can read company SWRs in its granted project, while requester mutations remain limited to their own SWRs. The migration adds additive grant, return, assignment, date-revision, attachment-purpose, and notification-outbox fields for later packages. Attachment metadata responses no longer expose storage keys.
- Validation: TypeScript, 216 existing tests, Next production build, fresh PostgreSQL 15 migration replay through 022, and guarded real-database access smoke passed.
- Known gaps queued: representative historical-data migration replay; B2 workflow transitions and use of new history tables; B3 attachment bytes, local message preview, queues, and KPIs; B4 repeatable private-beta setup; operational IT and pilot acceptance. The new invite API returns a token for local administration; email delivery and admin UI are later work.
- Production behavior changed: yes. Cross-module route and shared-library edits are required by the approved access boundary; this deviates from the older single-module coordination convention.

### 2026-09-24 — ADCQ-260923-001 Gate B2 Amelia workflow lifecycle
- Intent: implement the locally authorized Amelia workflow package while keeping GitHub publication deferred.
- Files touched: migration 023; ticket domain, repository, transitions, application services, API routes and contracts; status presentation; Amelia workflow unit and PostgreSQL smoke tests; existing route and lifecycle tests; `package.json`; `docs/BASELINE_TESTING.md`; this record.
- Behavior added/changed: Party Chief assignment is optional; Survey Lead or an assigned Party Chief may assign the Instrument Man; only the assigned Instrument Man performs field actions and completion is direct. An inability report snapshots its Party Chief or Survey Lead reviewer. Validated inability and Survey returns keep the same SWR through requester correction and fresh approval. Survey Lead can revise Need-By and priority with reasons. Requester edits are restricted to their own draft or returned SWR. Genuine cancellation and stop-work escalation follow the approved authority chain. Assignment, return, Need-By, and notification history now persist, including field-team stop-work notices. New mutation routes use the idempotency ledger.
- Validation: Node 22 TypeScript passed; 222 tests passed; the Next production build passed. PostgreSQL 15 migrations 001–023 applied to the disposable B2 database and the guarded workflow smoke completed with one return cycle, three assignment-history rows, one Need-By revision, and twelve durable outbox records.
- Known gaps queued: B3 real attachment bytes, staff evidence uploads, local message preview, operational queues, and KPI screens; B4 repeatable local private-beta setup. Reviewer transfer while inability validation is pending, operational IT services, representative historical-data replay, and pilot acceptance remain later decisions or gates.
- Production behavior changed: yes. Changes are local only and have not been published or deployed.

### 2026-09-24 — ADCQ-260923-001 Gate B3 local beta capabilities
- Intent: implement actual attachment transfer, local notification review, Amelia queues and measures, and role-specific beta screens while keeping publication and deployment deferred.
- Files touched: attachment domain/application/infrastructure and ticket attachment routes; project request configuration; notification preview and reporting modules/routes; Survey operations, requester correction, crew work/validation, attachment and admin screens; API contracts/client; project navigation/member read route; submit-time urgent reason behavior; capability/unit tests; `package.json`; `docs/BASELINE_TESTING.md`; this record.
- Behavior added/changed: server-generated local file keys replace caller metadata keys; allowed PDF/JPEG/PNG/text/CSV/Word/Excel files up to 30 MB are hashed and transferred; requester instructions are revision-bound to own drafts/returns while Survey Lead and assigned field staff may append labeled evidence to active work; completed SWRs are sealed; download rechecks ticket visibility and audits access. IT can configure a project file-count cap. Durable messages can be previewed, captured, and retried locally. Survey Operations prioritizes open and approved/IM-unassigned work and shows open Area/status, overdue Need-By, completed, and full first-submission-to-completion cycle measures. Short-notice submission now requires and audits an urgent reason instead of hard rejection.
- Validation: Node 22 TypeScript passed; 223 tests passed; the Next production build passed. Fresh PostgreSQL 15 migration replay through 023 and clean rerun passed. The guarded B3 smoke proved PDF and JPEG byte round trips, instruction sealing, field evidence, direct completion, four captured messages, and metric reconciliation; its missing-guard run failed before fixture creation.
- Known gaps queued: B4 repeatable sample users/data and device-local startup; browser walkthrough and usability review; organization-owned attachment storage and recovery; IT-reviewed content/malware policy; actual email transport; reporting windows/filters; representative historical-data replay; pilot operations and acceptance.
- Production behavior changed: yes. Changes are local only and have not been published or deployed.

### 2026-09-24 — ADCQ-260923-001 Gate B4 private-beta runbook
- Intent: make the device-local Amelia beta repeatable and reviewable with one setup command, stable sample identities, representative SWRs, and an operator walkthrough.
- Files touched: beta runtime and seed scripts; package commands; Project IT ticket visibility and its regression test; `docs/AMELIA_PRIVATE_BETA.md`, `docs/README.md`, `docs/BASELINE_TESTING.md`, and this record.
- Behavior added/changed: `beta:setup` creates an isolated persistent PostgreSQL and attachment dataset, applies migrations, and atomically seeds six sample identities and five workflow states; `beta:start` and `beta:stop` manage the local services. Setup is safe to rerun and preserves its JWT. Project IT now has full project ticket visibility. The runbook records identifiers, role-specific permissions, attachment boundaries, local data paths, and deferred operational services.
- Validation: initial setup and clean rerun passed through migrations 001–023; HTTP checks proved health, four logins, seeded states and measures, requester/company-authority boundaries, Project IT visibility, and capture of twelve local messages; shutdown left no PostgreSQL process. Node 22 TypeScript, 224 tests, and the Next production build passed.
- Known gaps queued: browser usability review, organization-owned storage and recovery, malware/content policy, actual email delivery, real-user onboarding, SharePoint import, named backup operators, and one-month Amelia pilot acceptance.
- Production behavior changed: yes, for Project IT ticket visibility. The repeatable beta runtime remains device-local; all changes remain local and GitHub publication is deferred.

### 2026-09-24 — ADCQ-260923-001 Gate B5 beta usability and visible traceability
- Intent: resolve friction and missing traceability found during the first real-browser walkthrough of the private Amelia beta.
- Files touched: authenticated project listing route/contracts/client and launcher; project heading; completed-SWR follow-up use case/API/capability/UI; ticket history repository/API/contracts/component; focused project, follow-up, history, and client tests; beta runbook and validation record.
- Behavior added/changed: signed-in users choose active projects by name instead of copying a UUID; project pages show the project name. An original requester can create an idempotent linked draft from their own completed SWR while the parent remains closed. Authorized ticket viewers can see a newest-first history spanning workflow, correction, assignment, Need-By, file, download, and local-message records; private storage, recipient, email, and idempotency details are removed.
- Validation: browser walkthrough verified the Amelia project card and name, Survey Operations, company-authority completed-ticket follow-up action, and ordered history. The live history endpoint returned ten records with no private keys. Node 22 TypeScript, 235 tests, and the Next production build passed; the beta services were stopped.
- Known gaps queued: role-specific navigation cleanup, organization-owned storage and recovery, malware/content policy, actual email delivery, real-user onboarding, representative historical-data compatibility, named backup operators, and one-month Amelia pilot acceptance.
- Production behavior changed: yes. Changes remain local and GitHub publication is deferred.

### 2026-09-24 — ADCQ-260923-001 Gate B6 access correction and compatibility
- Intent: correct an over-broad Project IT read grant found in review, reduce role-navigation friction, harden device-local storage, close traceability refresh/link gaps, and verify representative legacy records through the Amelia migrations.
- Files touched: ticket visibility regression; role-navigation map, shell and all-requests screen; beta runtime and local attachment storage permissions; follow-up audit/link and history refresh UI; historical compatibility smoke and package command; focused tests; beta runbook and validation record.
- Behavior added/changed: Project IT retains project configuration access with no inherent SWR, history, or attachment visibility. Project links are role-specific. Beta directories are owner-only, uploaded files are mode `0600`, and fresh local clusters use peer/reject authentication. Follow-up parents and children link in both directions and history refreshes after page mutations.
- Validation: live API checks proved Project IT project/config access, zero ticket results, and hidden history; disposable initdb produced peer local and rejected host rules. The guarded historical smoke preserved legacy `REJECTED`, `FIELD_CANCELED`, parent-linked resubmission, and attachment semantics through migrations 001–023 and refused a nonempty rerun. Final Node 22 TypeScript, test, and build results are recorded in `BASELINE_TESTING.md`.
- Known gaps queued: organization-owned storage and recovery, malware/content policy, actual email delivery, real-user onboarding, reporting windows/filters, named backup operators, and one-month Amelia pilot acceptance. Reviewer transfer while field inability is pending remains an explicit design decision.
- Production behavior changed: yes. Changes remain local and GitHub publication is deferred.

### 2026-09-24 — ADCQ-260923-001 Gate B7 role-safe project entry
- Intent: make every project entry path use the signed-in user's active membership and role instead of sending non-requester roles to requester pages.
- Files touched: project launcher and project-root page; shared project-entry redirect and navigation resolver; focused navigation tests; validation records.
- Behavior added/changed: project cards, direct project-root links, and the troubleshooting project-ID form now select the role landing page from the authenticated project list. Unknown or inactive membership IDs display an access error and do not navigate.
- Validation: Node 22.23.3 TypeScript passed, 239 tests passed, and the Next production build passed.
- Production behavior changed: yes. Changes remain local and GitHub publication is deferred.

### 2026-09-24 — ADCQ-260923-001 Gate B8 reversible beta reset
- Intent: let the private beta return to its five known sample cases after a walkthrough without silently deleting the prior test state.
- Files touched: beta runtime, reset path policy, package command, reset-policy tests, private-beta runbook, and validation record.
- Behavior added/changed: `beta:reset` stops the local database, rejects an unexpected or symbolic-link beta root, moves the complete dataset into an owner-only timestamped backup, and creates a fresh seeded beta.
- Validation: Node 22.23.3 TypeScript passed, the focused reset-policy tests passed, and all 241 tests passed. The current beta dataset was deliberately left intact.
- Production behavior changed: no; this is a device-local beta operation. GitHub publication is deferred.

### 2026-09-24 — ADCQ-260923-001 Gate B9 owner-scoped ticket actions
- Intent: align company-authority and staff ticket controls with the ownership and assignment rules already enforced by the APIs.
- Files touched: ticket capability resolver and contract; ticket detail endpoint and screen; requester list; capability tests; validation record.
- Behavior added/changed: the server reports edit, submit, cancel, follow-up, instruction-upload, and field-upload capabilities for the current actor and ticket. The UI renders only those actions. Requester cancellation is now on an owned ticket detail rather than the company-visible list.
- Validation: live company-authority checks returned no mutation capabilities on another requester's returned SWR and only follow-up capability on the authority's own completed SWR. Node 22.23.3 TypeScript, 245 tests, and the Next production build passed; beta services were stopped.
- Production behavior changed: yes. Changes remain local and GitHub publication is deferred.

### 2026-09-24 — ADCQ-260923-001 Gate B10 approved requester intake
- Intent: remove superseded mandatory Discipline and Phone/Radio assumptions from the Amelia request path.
- Files touched: request create API and contract; new-request and requester-correction screens; ticket detail labels; requester-update validation; create-route test; beta runbook and validation record.
- Behavior added/changed: Area, Request Type, Point of Contact, Need-By Date, and Request Details are the enforced requester minimums. Craft/Discipline and Phone/Radio Channel are optional and may be omitted or cleared.
- Validation: the create-route test omits both optional fields and verifies normalized persistence. Node 22.23.3 TypeScript, 245 tests, and the Next production build passed.
- Production behavior changed: yes. Changes remain local and GitHub publication is deferred.

### 2026-09-24 — ADCQ-260923-001 Gate B11 requester identity in company views
- Intent: make company-authority visibility usable by identifying which employee submitted each visible SWR.
- Files touched: tenant-scoped user name lookup; ticket list/detail response projection and contract; cards, details, requester navigation, runbook, and focused tests.
- Behavior added/changed: visible SWRs show `Requested by: You` or the requester's display name. The requester list is labeled `Requests` so company-authority visibility is not presented as personal ownership.
- Validation: the name lookup tests prove tenant scoping, ID deduplication, name-only output, and the empty-page fast path. Node 22.23.3 TypeScript, 247 tests, and the Next production build passed.
- Production behavior changed: yes. Changes remain local and GitHub publication is deferred.


### 2026-09-27 — Impeccable frontend polish
- Intent: implement the user's requested frontend refinement on the existing phase5 Amelia beta. Role: IMPLEMENTER; bounded ownership of shared UI, layouts, and Survey Operations presentation.
- Files touched: `src/app/globals.css`; auth and projects layouts; Survey Operations page; shared Card, ProjectNav, ProjectShellHeader, feedback, and TicketCard components; the metrics status field in `src/lib/contracts/projects.ts`; this log.
- Behavior added/changed: retain the ivory/teal palette, fonts, routes, data, and workflow actions; improve heading spacing, login width, request-list separators, responsive metric layout, and assignment controls using existing Field/Select components. Add visible keyboard focus, a skip link, current-page navigation semantics, distinct detail-link names, live feedback roles, consistent 44px control targets, and reduced-motion support. Loading queues no longer claim to be empty. Metrics use the existing status labels; their client contract now uses TicketStatus.
- Validation: baseline TypeScript and all 248 tests passed. Final Node 22.23.3 TypeScript, all 248 tests, production build, and git diff --check passed. Browser checks covered Survey Operations and request lists on desktop/390px mobile, request detail and login on mobile, requester intake at 768px and 390px, step navigation, required-field disabled state, and keyboard focus. Inspected mobile/tablet routes had no horizontal overflow; sampled queue controls were at least 44px tall. Impeccable edit hooks reported no deterministic issues. The Impeccable context launcher was unavailable; existing instructions, implementation, and running beta supplied context (no PRODUCT.md or DESIGN.md exists).
- Verification environment: running a production build alongside the preview replaced its Next cache and temporarily caused a missing-chunk error. Restarting the preview resolved it; subsequent requester and Survey Lead navigation passed. The pre-existing workspace-root inference warning remains. No database reset, workflow mutation, external delivery, or dependency change was needed.
- Scope: presentation and accessibility only; no schema, authorization, or workflow logic changes. Published to `phase5` on the user's 2026-09-27 instruction; no deployment. Preview left running on loopback for user review.

### 2026-09-29 — Batch 12 (Axiom UI foundation)
- Intent: continue the approved Phase 5 baseline as IMPLEMENTER; align shared UI with the user-supplied Axiom Civil Services 2026 Brand Guide and Impeccable Operate guidance.
- Files touched: `src/app/globals.css`, root/auth/project layouts, `src/components/ui/product-brand.tsx`, `src/components/ui/project-nav.tsx`, `public/brand/`, `public/fonts/`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/.gitignore`, this append-only record.
- Behavior added/changed: supplied Axiom artwork in auth and project headers, self-hosted licensed Roboto, slate/white/Steel Blue palette, accessible darker blue for action labels, restrained panels, consistent spacing, 44px navigation targets, explicit focus styles, skip navigation, current-page semantics, wrapping phone navigation, reduced-motion support. Workflow and data access behavior unchanged.
- Verification: baseline and final TypeScript passed; baseline and final suite both report 247 pass, 1 fail (existing Windows POSIX permission assertion in attachment/local-storage.test.ts). Production build passed on the available Node 24.13.1 runtime; this is not a repeat of the documented Node 22 baseline. Live headless Edge checks at 1440x1000 and 390x844 confirm no horizontal overflow, successful Roboto/artwork loading, and visible keyboard focus. Login and launcher captures used browser-only labeled project fixtures, not authenticated database acceptance. Independent screenshot/source review disposition: ship for this bounded foundation.
- Module boundary deviation: explicitly requested shared UI work spans presentation layouts/components and bundled brand assets rather than a domain module. No API, migration, audit event, or business rule changed.
- Impeccable check: changed-target detector completed with one advisory for Roboto being common; retained intentionally because the supplied Axiom guide mandates Roboto or Montserrat. No other findings were returned.
- Known gaps: existing Windows attachment permission test; database-backed pilot acceptance and remaining workflow screens are not verified by this visual batch. The branch's macOS-oriented beta runtime still needs a separately scoped Windows development setup. No deployment or publication performed.
- Production behavior changed: yes, presentation only.

### 2026-09-29 — Batch 13 (Sabine local simulation)
- Intent: IMPLEMENTER; start the user-approved anonymized site simulation using the list export, 1 manager, 5 area superintendents, 42 AssignedtoId-derived chiefs, and 126 simulated Instrument Men.
- Files touched: `scripts/sabine-runtime.mjs`, `scripts/seed-sabine.ts`, `scripts/verify-sabine.mjs`, `docs/SABINE_SIMULATION.md`, this log. Ignored `.data/sabine/` contains anonymized data, generated local credentials, access guide, and verification results. A local extraction/browser-check script outside the repository supports this one-off dataset.
- Behavior added: isolated labeled PostgreSQL 15 container on loopback port 15488 and Next server on 3106; owner-only Windows local-file ACLs; existing migrations applied only to the isolated database; transactionally seeded 20,025 supported historical snapshots and 84 live workflow cases. All 20,199 source rows remain in the sanitized snapshot, with 174 unsupported types excluded from domain tickets rather than coerced. Existing data is preserved on setup reruns; no reset/delete operation is supplied.
- Privacy and fidelity: source identities and all free text replaced; attachments omitted; deterministic completion dates and fictional IM assignments are labeled. Source field/CAD statuses retained; generic historical cancellation is explicitly mapped for display, not asserted as a known actor/path. Historical memberships are VIEWER. Chief home areas are inferred, not verified reporting lines. No ambiguous Forms merge, real email, new schema, or external-system mutation.
- Verification: baseline and final TypeScript pass. Baseline and final regression suite: 247 pass, 1 pre-existing Windows POSIX attachment-permission assertion fails. All migrations apply and skip on rerun; seed rerun preserves existing tenant. Database/API verifier passes count reconciliation, 42 three-person rosters, no attachments, alias-only emails, per-ticket audit presence, historical VIEWER membership, unauthenticated rejection, and six-role live visibility (manager 84, Train 1 superintendent 12, chief1 1, im1.1 1, requester0 14, admin 0). Headless Edge real login/launcher/operations works at desktop and 390px widths with no horizontal overflow or page errors. Uses the existing successful Phase 5 build on Node 24; no new production-code change or new build was required by these scripts.
- Recovery during setup: Windows reserved port 55488; the verified never-started simulation container was removed without deleting its volume, then recreated on 15488. An initial seed failed on a chief with only unsupported source categories; its transaction rolled back fully. Deterministic live sampling was corrected and the complete seed succeeded.
- Known gaps: existing UI has Amelia-specific queue copy; source-specific extractor is not a generalized production importer; unsupported request types and exact historical CAD/cancellation mappings need product decisions before any production migration; representative browser mutation/permission checks beyond this initial smoke remain to run. Existing Windows attachment permission failure remains open.
- Module boundary deviation: simulation tooling invokes existing identity/tenancy/ticket facilities from scripts, rather than changing a domain module. Existing uncommitted Axiom UI work was preserved. No commit, push, production deployment, or publication.
- Production behavior changed: no; local fixture/runtime tooling only.

### 2026-09-29 — Batch 14 (Sabine rollback-only workflow validation)
- Intent: TEST_WRITER; validate the current live simulation's application/database workflow without consuming or changing its practice cases.
- Files touched: `tests/beta/sabine-workflow-smoke.ts`, `docs/SABINE_SIMULATION.md`, this record. No production behavior, schema, role, or permission change.
- Coverage: invalid draft approval; wrong-role approval; cross-tenant lookup/mutation rejection; other-requester visibility and edit/cancel rejection; wrong Instrument Man and wrong captured-reviewer rejection; report inability, return, correct, resubmit with stable ID/number/first-submission date; direct IM completion; terminal-state cancellation rejection; owner cancellation; audit failure injection followed by caller transaction rollback with no approved state/event retained.
- Validation: TypeScript passed; guarded real-PostgreSQL smoke passed and explicitly verified no test tickets, audit events, or outbox messages remain after rollback. Baseline remains 247 passing tests and one pre-existing Windows attachment POSIX-permission assertion failure. No tests were weakened or skipped.
- Known gaps: this exercises application services and database transactions, not browser mutation or HTTP idempotency behavior. It does not prove transaction durability across crashes. Remaining production/pilot decisions from prior batches are unchanged.
- Production behavior changed: no. No commit or push.
- Follow-up checks: the missing-guard invocation rejects before opening a database connection; the original seed/API verifier still passes after the rollback test. Added ten-second connection, query, and HTTP timeouts to the simulation verifier so stalled checks fail explicitly. A live web-process issue (GET login worked, POST login timed out, fresh database connection succeeded) recovered after restarting only the verified Sabine web PID; PostgreSQL and all data stayed intact. The exact cause is not yet established. The restarted server now uses the runtime's corrected production NODE_ENV.

### 2026-09-29 — Batch 15 (Windows storage decision audit)
- Intent: AUDITOR; investigate the native Windows attachment-permission failure without weakening tests.
- Files touched: `audits/windows-attachment-permissions.md`, this record. No production or test edits.
- Evidence: storage relies on POSIX modes that do not establish owner/group/other protection on Windows; Sabine's root independently has an explicit current-user-only ACL. Docker targets Linux Node 22. The failure alone does not prove cross-user exposure; accepting 0666 would not prove protection.
- Decision gate: recommend the Linux-container attachment runtime with unchanged protection assertions, or explicitly approve native Windows ACL support and its account/inheritance contract. The user's security/permissions gate requires direction before implementation. Simulation services and data remain intact.
- Production behavior changed: no. No commit or push.

### 2026-09-29 — Batch 16 (approved Linux Sabine runtime)
- Intent: IMPLEMENTER; carry out the owner's Linux-container decision while preserving the current simulation and unchanged attachment protection assertions.
- Files touched: `Dockerfile`, `.dockerignore`, `scripts/sabine-runtime.mjs`, `docs/SABINE_SIMULATION.md`, `audits/windows-attachment-permissions.md`, this append-only log.
- Behavior added/changed: pin Linux Node 22.23.3; run TypeScript and tests before image production build; include Axiom public assets; exclude local data/secrets and workspace metadata from build context; run web as non-root `node` with direct Node startup and a persistent 0700 attachment root. Sabine launcher uses a labeled dedicated network, loopback web port 3106, existing PostgreSQL volume, and separate attachment volume. It rejects stale web images and nonempty legacy attachment storage instead of silently losing bytes. Stop retains both volumes.
- Verification: two Linux image builds passed TypeScript, all 248 tests (zero skips/failures), and production build. Final image verified Node version, UID 1000, public artwork/fonts, and absence of `.data`/`.env`. Live storage class in the mounted attachment volume passed write/read/delete with 0600 files and 0700 directories; only its generated temporary check directory was removed. API/database checks preserved 20,025 historical and 84 live requests, 634 fictional identities, six-role visibility, and zero imported attachments. Actual Edge login/operations passed at desktop and 390px mobile widths with zero page errors or horizontal overflow.
- Runtime transition: stopped only the verified native Sabine web PID; PostgreSQL and other application containers stayed intact. Linux web now serves the existing URL and credentials. No database reset, migration, schema, permission, or business-rule change.
- Module boundary deviation: approved container/runtime infrastructure work spans shared build files and simulation scripts, not a domain module. Existing Phase 5 and Axiom changes preserved.
- Known gaps: native Windows ACL support remains unsupported; browser mutation coverage and full production/pilot acceptance remain separate from this runtime validation.
- Production behavior changed: container packaging/runtime only. Local simulation launched; no production deployment, commit, or push.

### 2026-09-29 — Batch 17 (exact Sabine HTTP visibility verification)
- Intent: TEST_WRITER; strengthen existing simulation validation so matching list totals cannot conceal wrong-record exposure.
- Files touched: `scripts/verify-sabine.mjs`, `docs/SABINE_SIMULATION.md`, this append-only log.
- Behavior added: compare exact live-request IDs with tenant/project-scoped fixture expectations for six representative accounts; assert tenant/project identity in list/detail payloads; verify every live detail URL for each account; require 404 and no ticket/capability payload on denied reads; assert all six exposed mutation capabilities are false on sampled historical details.
- Verification: Linux baseline TypeScript, all 248 tests, and production build pass. Updated verifier passes 504 live detail checks (112 allowed, 392 denied), exact-ID lists, and six historical capability samples against the running Linux server. JavaScript syntax check passes. No request, assignment, event, or attachment mutation is performed by these added checks.
- Known gaps: the seed has flat AOR nodes and one tenant; these checks do not establish descendant-AOR or cross-tenant coverage. They sample six accounts and do not test HTTP mutation enforcement. Existing application-level rollback checks remain separate evidence.
- Module boundary deviation: extended the existing one-off simulation verifier instead of adding production or module test behavior. Production behavior changed: no. No commit or push.
- Post-change validation: mounted the updated verifier read-only into the Linux checks image; its syntax check, `pnpm tsc --noEmit`, and all 248 regression tests passed. Diff whitespace check passed; branch remains `phase5`.

### 2026-09-29 — Batch 18 (attachment upload handler regression coverage)
- Intent: TEST_WRITER; cover the existing multipart upload handler's success, rejection, and staged-file cleanup paths without mutating Sabine practice records.
- Files touched: `tests/attachment/attachment-read-route.test.ts`, this append-only log. Reused existing route fixtures in one attachment test file; no production changes.
- Coverage: server-captured return cycle and storage key override client-submitted fields; success retains bytes and emits the correctly scoped upload audit; invisible ticket, other-requester ownership, completed instructions, count cap, and injected audit failure all reject and remove staged bytes. Invalid purpose/empty upload reject before storage; disallowed file type cleans up without metadata or audit persistence.
- Validation: Linux Node 22 baseline TypeScript and 248 tests pass; added eight route-handler tests produce 256 passing tests. Tests invoke the real handler/application use-case and metadata validator with injected repository/storage/transaction doubles.
- Limits: these tests prove handler orchestration, not real PostgreSQL rollback, network HTTP behavior, cross-tenant repository filtering, or storage removal failure handling. Existing Linux volume and application/database smoke evidence remains separate. No simulation data, API contract, security policy, or business rule changed. No commit or push.

### 2026-09-29 — Batch 19 (isolated Linux live HTTP acceptance)
- Intent: TEST_WRITER; validate real network mutation behavior without consuming Sabine practice records or relaxing existing protections.
- Files touched: `tests/beta/linux-http-smoke.mjs`, `docs/SABINE_SIMULATION.md`, this append-only log. Standalone guarded acceptance script uses existing Amelia seed fixtures and existing images; no production or schema changes.
- Coverage: real cookie login; create replay and changed-payload conflict; owner-only correction; server revision-bound instruction upload; submit, documented return, correction and resubmit preserving ID, public number, and first-submission timestamp; approval replay; assignment/start/direct IM completion; sealed instruction/support upload rejection; download byte equality and nosniff header; exact audit counts; two accepted uploads reconcile with two metadata rows and two stored files, with rejected staged bytes removed.
- Validation: baseline Linux TypeScript and 256 regression tests passed. Live HTTP run `swr-http-8dd6ac93` passed. Earlier runs exposed two test-expectation mistakes (latest submission versus first submission timestamp, and canonical start event `ticket.in_progress`); expectations corrected against source, no application change. Unguarded invocation rejects before creating resources. Sabine verification still passes all counts, role lists, and 504 direct-access checks afterward.
- Isolation/recovery: each run creates uniquely named labeled containers/network/volumes with random infrastructure secrets, no public DB port, and loopback web port 3107. All three runs' test containers are stopped; their labeled volumes and networks remain for diagnosis. Sabine and other app services remain running. No data deletion, reset, or production infrastructure mutation.
- Boundaries: host test driver is Node 24; web, migration and seed execute in Linux Node 22 images. This is network HTTP acceptance, not browser mutation, all-role/cross-tenant coverage, concurrency, field-inability HTTP coverage, or crash-durability proof. No commit or push.

### 2026-09-29 — Batch 20 (responsibility and intake alignment audit)
- Intent: AUDITOR; compare remaining product behavior with approved R03–R05 rather than equating passing legacy/fixture tests with completion.
- Files touched: `audits/phase5-responsibility-intake-gate.md`, this append-only log. No production or test edits.
- Findings: migration 022 provides responsibility grants but no source/test/script runtime use was found; approval is manager-only and chief visibility requires direct ticket assignment. Submission still needs department context absent from the five-field UI path, and title/whitelist-derived priority remains. Existing HTTP fixtures supplied a department and therefore did not cover the hidden-department gap.
- Verification: current source, migration, approved requirements, and prior gate records inspected; Linux TypeScript and all 256 tests pass. Findings distinguish source-proven behavior from unperformed browser/grant acceptance.
- Decision gate: choose explicit Area-delegated Superintendent review (recommended) or central manager-only review while implementing coordinator queues. Coverage, assignment eligibility, absence, and historical snapshot semantics affect permissions; no inferred grant or permission expansion is authorized by the current staffing description. Stop implementation pending owner direction.
- Production behavior changed: no. Existing simulation and worktree preserved; no commit or push.

### 2026-09-29 — Batch 21 (approved Area-delegated review)
- Intent: IMPLEMENTER, Ticket module plus shared authorization composition; implement the owner's explicit "Area delegated" decision recorded as Decision 10.
- Files touched: `src/lib/survey-review-authority.ts`, ticket approval/return/shared transition helpers, `tests/ticket/amelia-workflow.test.ts`, `tests/beta/linux-http-smoke.mjs`, `scripts/grant-sabine-review.mjs`, decision log, Sabine runbook, this append-only record.
- Behavior: manager project-wide review preserved; Superintendent approval/pre-assignment return requires an active explicit Area reviewer grant. Tenant/project-scoped recursive ancestor lookup honors hierarchical Areas and excludes revoked grants, inactive users, wrong membership roles, and subcontractors. Lock grant/membership/user/company rows during the caller transaction; authorize the same ticket snapshot used for optimistic transition validation; append grant identity/scope to the existing transition audit. Captured field-inability reviewer remains authoritative; no new cancellation, priority, date-revision, or field stop-work authority.
- Sabine activation: transactionally created and audited 11 Area grants for the five existing fictional Superintendents; second invocation created zero. The opt-in script refuses silently regranting revoked entries. Recreated only the labeled web container while preserving its attachment volume, database, and credentials; old container metadata removed, data retained. Historical project unchanged.
- Validation: baseline 256 tests pass; Linux TypeScript, 259 tests, and production image build pass. Real HTTP run `swr-http-e821e5da` proves delegated return/approval, replay, out-of-Area denial, revocation denial, preserved historical grant snapshot, and remaining lifecycle/attachment checks. Test harness PostgreSQL readiness now uses TCP to avoid racing the image's temporary initialization server. Sabine's 20,025 historical/84 live counts and all 504 read-access checks still pass after activation.
- Boundaries/deviations: shared `src/lib` authorization composition reads existing tenancy grant storage without changing its schema; audit payload uses the existing event. No UI changes. Only review authority is activated; coordinator discovery/assignment work and hidden-department/legacy-priority gaps remain unfinished. No grant-admin UI or inferred chief grants added. No commit, push, or production deployment.
- Production behavior changed: yes, approved delegated review authorization.

### 2026-09-29 — Batch 22 (compact operations navigation)
- Intent: IMPLEMENTER, owner-requested shared presentation refinement for Sabine Survey Operations; reduce scrolling without changing workflow authority or data.
- Files touched: operations `page.tsx` and colocated `operations.css`, `src/components/ui/operations-health.tsx`, `src/lib/operations-view.ts`, `tests/lib/operations-view.test.ts`, `DESIGN.md`, this append-only log. Browser acceptance driver and screenshots are outside the repository in the session visualization directory.
- Behavior: replace Amelia Queue Health prose with five clickable measures, native detail dialogs and a numeric Area/status heat map. Show one of Need Assignment, Open Requests, or Local Messages at a time. Add search, Area/status/priority or delivery filters, clear filters, 10/25/50/100-item pages, collapsed title rows, and expand-page/collapse-all controls. Preserve existing workflow buttons and full detail text when expanded. Tabs support arrow/Home/End keys; native dialog supports Escape and focus containment.
- Validation: baseline Linux TypeScript and 259 tests passed. Final Linux TypeScript, 261 tests and production image build pass. Browser acceptance passes login, tab changes, search/status/delivery filters, pagination/page size, row expansion/collapse, metric dialog pagination and Escape; desktop 1440px and mobile 390px have no horizontal overflow or page errors. A mobile grid minimum-width regression introduced during title truncation was caught and corrected before final passing acceptance. Initial browser assertions assumed seeded counts; corrected to current live counts without modifying records.
- Design: Impeccable distill/operate guidance preserved Axiom colors, Roboto, focus and control patterns while moving detail behind intentional disclosure. One detector run flagged tab border/radius and token advisories: square tab rule and existing control radii/warning colors now used; compact data-display typography documented. Visual inspection covered dashboard, mobile and heat-map dialog, not every role or workflow mutation.
- Boundaries: pagination/filtering is client-side over the existing fetched request set; no server-side query optimization or permissions change. Local messages remain limited to the existing API response. Recreated only the labeled Sabine web container, retaining database and attachment volumes. Seed-state verifier not rerun because live practice records have changed; no reset performed. No commit or push.
- Production behavior changed: presentation and navigation only.

### 2026-09-29 — Batch 23 (refresh hang diagnosis and pool repair)
- Intent: IMPLEMENTER, shared database infrastructure; first measured repair within the owner's refresh performance and role-scoped KPI objective. Claimed shared paths `src/lib/db.ts` and new `src/lib/lazy-pool.ts`; no module business-rule changes.
- Files touched: those two database files, `tests/lib/lazy-pool.test.ts`, `tests/beta/pool-lifecycle-smoke.ts`, `docs/KPI_PERFORMANCE_PROGRESS.md`, this log. Timing driver and raw results reside in the session visualization directory outside the repository.
- Root cause/behavior: unbound lazy Proxy methods lost pg pool state replacement on idle client expiry, eventually exhausting apparent capacity and queueing API calls indefinitely. Bind methods to the underlying pool while preserving build-time lazy initialization and error propagation. Reproduced with real PostgreSQL at max two connections: third idle cycle timed out before fix, bound comparison passed. No retry/fallback branch added.
- Validation: baseline Linux TypeScript and 261 tests pass. Both new unit regressions fail against the unbound implementation, pass after repair; Linux TypeScript, 263 tests and production build pass. Opt-in PostgreSQL smoke completes 12 idle-expiry cycles with no retained client count or queued waiters. Recreated only the labeled Sabine web container with existing data/attachment volumes retained; authenticated browser loading works again.
- Performance evidence: live cold last resource 328 ms; historical normal list one ticket call/33.8 KB decoded API data; direct historical Operations loader 201 ticket calls/33.6 MB before later role rejection. Count/status aggregate query plans are indexed and approximately 1–2 ms at 20,025 tickets. This confirms a separate fetch-all scaling defect, not a reason for new infrastructure.
- Known gaps queued: server pagination/filtering, authorization-shared KPI aggregation, scoped chart controls, five visualization types, broad role/API tests, and final before/after proof remain required by the active objective. Full checklist and measurement limits are in the progress document. No commit/push, data reset or production deployment.
- Production behavior changed: database pool lifecycle correctness only; KPI/queue features not yet changed in this batch.

### 2026-09-29 — Batch 24 (Survey Authority dashboard requirement intake)
- Intent: incorporate the owner's management-dashboard addition into the active performance/KPI objective without restarting existing work.
- Files touched: `docs/KPI_PERFORMANCE_PROGRESS.md`, this append-only log. Documentation only.
- Evidence inspected: project entry redirect and navigation map, existing health/pop-out implementation, migration 022 responsibility grants, and current Area review authorization. Existing rosters do not encode Superintendent-to-crew ownership; historical ticket snapshots are not a substitute.
- Requirement added: capability-gated Survey Authority landing overview, authorized-crew request population, complementary metrics/distributions/trends, coordinated filters, existing-view drill-downs, server aggregation, preserved other-role experiences, Axiom reference adaptation and explicit deferral of unsupported metrics.
- Decision pending: explicit crew supervision versus Area-derived coverage, and treatment of authorized unassigned requests. Questions sent to owner; no new permission inferred. Unaffected performance/shared query work remains authorized and active.
- Validation: source inspection only for this documentation batch; preceding code baseline is Linux TypeScript plus 263 passing tests and the 12-cycle PostgreSQL pool smoke. No new runtime behavior, production edits, data mutations, commit or push.
- Production behavior changed: no.

### 2026-09-29 — Batch 25 (server-filtered operational request pages)
- Intent: IMPLEMENTER, Ticket module plus the ticket list API boundary; prepare bounded server-side Operations queries without changing existing authorization or waiting on crew-supervision policy.
- Files touched: `src/modules/ticket/application/query-filters.ts`, `application/ports.ts`, `infrastructure/ticket-filter-clause.ts`, `infrastructure/ticket.repository.ts`, `src/lib/ticket-list-query.ts`, `src/app/api/tickets/route.ts`, `tests/ticket/query-filters.test.ts`, `tests/beta/ticket-query-smoke.ts`, progress document and this log. Shared paths claimed for this batch; only one API route modified. External HTTP acceptance driver stored in the session visualization directory.
- Behavior: typed queue/Area/status/priority/type/search filters, parameterized after existing visibility; identical count/page population; stable operations and created ordering. Validate page limits, offsets, duplicate dimensions, UUID Area and bounded search at the HTTP boundary. Explicitly reject malformed inputs; do not silently clamp or partially parse them. Search metacharacters remain literal with strpos, not wildcard expansion.
- Validation: baseline Linux TypeScript and 263 tests passed. Final Linux TypeScript, 268 tests and production build passed. PostgreSQL acceptance checks 124 filtered counts/pages/isolation outcomes across manager, Superintendent, Party Chief, Instrument Man, Requester and admin-only roles. HTTP acceptance passes 60 checks across the same six accounts, including 400 responses for malformed parameters. No workflow actions or record changes.
- Boundaries: local API activated by recreating only the verified Sabine web container with data/attachment volumes preserved. Existing client still uses fetch-all; client integration, centralized reporting scope and charts remain pending. SQL-level tests and six-role acceptance are not a claim that the full KPI security matrix is complete. No crew authority inferred, schema changes, commit or push.
- Production behavior changed: ticket list filtering and strict query validation only.

### 2026-09-29 — Batch 26 (Sabine hierarchy clarification)
- Intent: record the owner's project-specific Survey Manager → Survey Superintendent → Party Chief → Instrument Man hierarchy for the ongoing authority dashboard work.
- Files touched: decision log (Decision 11), KPI progress document, this append-only log.
- Boundary: reporting structure confirmed; individual supervisor mappings and unassigned dashboard population remain unresolved. No authority inferred from Area overlap, no historical data rewritten, and no universal hierarchy imposed on other projects.
- Validation: documentation-only clarification checked against current grants/roster findings; no code or runtime changes and no test rerun. Latest code evidence remains 268 passing tests plus database/HTTP query acceptance.
- Production behavior changed: no.

### 2026-09-29 — Batch 27 (Survey Team management discovery)
- Intent: inspect the Main Survey Authority staffing request and integrate it with the active hierarchy/dashboard objective.
- Files touched: decision log (Decision 12), KPI progress document, this log. Inspected project navigation, admin screen, member route/use case, and Area assignment use case.
- Findings: existing manager navigation has no crew-management menu; member and Area writes are restricted to administrative roles. A narrowly scoped Survey Manager staffing workflow is needed; do not grant blanket membership administration or arbitrary role creation.
- Pending boundary: manager-led invitations/account creation versus assigning existing registered individuals. Party Chief/Instrument Man role types remain fixed; missing supervisory mappings and historical assignments must not be fabricated or overwritten.
- Validation: documentation-only discovery; no source changes, runtime mutations or test rerun. Existing baseline remains 268 tests with prior SQL/HTTP acceptance. No commit or push.
- Production behavior changed: no.

### 2026-09-29 — Batch 28 (bounded Operations client)
- Intent: complete the server-pagination client integration from Batch 25; preserve queue interactions and metric drill-downs.
- Files touched: Operations page, operations-health.tsx, apiClient.ts, use-ticket-page.ts, operations-view.ts, tests/lib/operations-view.test.ts, progress document and this log.
- Behavior: request only the active filtered page; load metric detail on demand; defer messages and member choices; gate loading on successful metrics authorization; ignore stale page responses.
- Validation: Linux TypeScript, 269 tests and production build passed. Browser pagination/filter/disclosure/dialog checks passed with no desktop/mobile overflow or page errors. Local measurement reduced the disallowed historical Operations visit from 201 ticket calls to zero; this is not a 20,025-ticket authorized manager dashboard benchmark. Live initial API payload was 100,242 bytes versus 272,584 previously; practice data changed in between, so this is not an identical-fixture comparison.
- Known gaps: existing metrics authorization/aggregates, chart framework and larger dashboard objective remain pending. Messages remain bounded to the existing latest-100 API; full roster choices are still loaded on assignment tab. No commit, push or data reset.
- Production behavior changed: yes, bounded/deferred client reads.

### 2026-09-29 — Batch 29 (account navigation)
- Intent: IMPLEMENTER, Tenancy self-account read plus explicitly claimed shared navigation/API surfaces; add the requested top-right hamburger menu without broadening project permissions.
- Files touched: components/ui/account-menu.tsx and .css, account-navigation.ts, account-details.tsx, projects root layout, profile and assignment-details pages, api/account/route.ts (one route), lib/apiClient.ts, tenancy/application/my-account.ts, tenancy/infrastructure/my-account.reader.ts, tests/tenancy/my-account.test.ts, progress document and this log.
- Behavior: Home uses the existing role-specific project entry; Profile shows the signed-in person's name/email/company and existing password-reset link; Assignment Details shows explicit Area and PC/IM roster relationships; Projects opens the existing authorized launcher; Sign out uses the existing endpoint with pending/error states. Keyboard dismissal/focus and outside-click dismissal supported. No invented superintendent mappings or dead configuration links.
- Authorization: validate active session, obtain project membership server-side before reading assignments, scope SQL by tenant/project/self, omit credentials from responses, disable account-response caching. Read-only; no state transitions, migrations or new audit events.
- Validation: baseline TypeScript and 269 tests passed; final TypeScript, 274 tests and production build passed. Browser acceptance evidence is recorded in the progress document. Tests cover revoked/deactivated sessions, nonmember rejection, query scoping and project-preserving navigation.
- Scope deviation: frontend and one API route added alongside the Tenancy use case to deliver the explicitly requested cross-cutting navigation; no other module implementation changed. Existing unrelated working changes retained.
- Known gaps: profile editing and manager staffing workflow are not implemented by this menu. Existing hierarchy/dashboard objective remains in progress. No commit or push; database and attachment volumes retained.
- Production behavior changed: yes, navigation and read-only self-account views.

### 2026-09-29 — Batch 30 (historical closeout review)
- Intent: IMPLEMENTER, Ticket module with explicitly claimed shared API/client/UI/doc paths. Owner confirmed read-only all-history closeout exploration and code-first extension of the existing Axiom interface; do not alter imports or lifecycle status.
- Files touched: ticket/application/review-tickets.ts, ticket/infrastructure/review-query.ts and ticket.repository.ts; lib/review-query.ts and apiClient.ts; api/projects/[projectId]/review/route.ts (one route); components/tickets/project-review.tsx and .css; project requests page; tests/ticket/review.test.ts and tests/beta/review-plan.ts; PRODUCT.md, .impeccable/config.json and registered surface brief; docs/HISTORICAL_REVIEW_BRIEF.md, KPI progress and this log. External acceptance scripts and generated screenshots are local evidence, not shipping assets.
- Behavior: coordinated search/facets/date filters, chart drill-downs, overview/request views, compact expandable rows, page-size and stable sort controls. Same server authorization predicate supplies every aggregate, facet and returned page. Requester/IM/config-admin comparison access explicitly denied. Fixed an observed PostgreSQL 15 filtered-CTE misestimate without widening access or adding infrastructure.
- Validation: baseline 274 tests; final TypeScript, 278 tests and production build pass. 120 six-account HTTP assertions passed. Desktop/mobile browser filters/drill-downs/pagination/disclosure/empty/error-retry checks passed; no overflow or page errors. Read-only EXPLAIN evidence and local payload/timing recorded in KPI progress. Independent design finish handoffs recorded there separately.
- Data: 20,025 imported snapshots, 33 open exceptions retained; synthetic-date/assignment and incomplete-source disclosures visible. Read-only request work: no mutation audit event, migration, imported record rewrite, reseed or lifecycle transition. Only the labeled web container replaced; DB/attachment volumes retained.
- Scope deviation: shared All Requests surface now exposes review for its already-authorized readers, including live projects; Live Operations and personal/IM dashboards are unchanged. No other domain module implementation changed. Existing unrelated working changes preserved; no commit or push.
- Known gaps: monthly chart limits to latest 120 populated months and says so; no productivity/turnaround or reconstructed workflow metrics. Broader Live authority-dashboard and Survey Team staffing work remains unfinished.
- Production behavior changed: yes, read-only review API and All Requests interface.
- Finish handoff: independent Impeccable reviewer returned Ship with no material findings; read-only documenter confirmed alignment and recorded nonblocking surface-documentation gaps in KPI progress. Incumbent DESIGN.md/sidecar preserved. Final diff whitespace check passed; preview is available on port 3106.

### 2026-09-29 — Batch 31 (shared KPI data visibility)
- Intent: IMPLEMENTER; continue the active refresh/KPI objective with one common authorized population before visualization expansion.
- Files touched: lib/ticket-visibility-clause.ts; ticket/infrastructure/ticket.repository.ts; reporting/application/amelia-metrics.ts; reporting/infrastructure/amelia-metrics.reader.ts; api/projects/[projectId]/metrics/route.ts (one route); tests/reporting/amelia-metrics.test.ts; tests/beta/amelia-capabilities-smoke.ts and sabine-metrics-http.mjs; KPI progress and this log.
- Behavior: preserve existing Ticket predicate in shared glue, require resolved project scope for metrics, deny configuration-only Project Admin, retain tenant-admin read-only health, scope requester/IM/PC/Area/department counts, exclude drafts and derive summary/heat map in one SQL snapshot. Reporting application now delegates SQL to an infrastructure reader through a port. No new role or personnel-comparison permission.
- Validation: baseline TypeScript, 278 tests and build passed; final TypeScript, 282 tests and build passed. 70 read-only real-preview metrics assertions across six accounts and 120 historical regression assertions passed. Tenant-admin fixture expectation corrected after actual role evidence; no application permission widened to satisfy a test.
- Scope deviation: sequential Ticket extraction then Reporting integration plus explicitly claimed shared predicate/API route, necessary to centralize authorization across operational and KPI reads. No concurrent writers, migrations, state transitions or audit events. Existing unrelated changes retained. Only labeled local web container replaced; database and attachment volumes retained.
- Known gaps: reusable visualizations/filters, source-quality-aware cycle definitions and comprehensive cross-tenant/company analytics fixture coverage remain in the full objective. No full completion claim, commit or push.
- Production behavior changed: yes, role-scoped read-only metrics.

### 2026-09-29 — Batch 32 (real PostgreSQL KPI scope proof)
- Intent: TEST_WRITER for existing Reporting behavior; verify the shared KPI authorization boundary before adding new filters and visualizations.
- Files touched: tests/beta/scoped-metrics-postgres.ts; KPI progress and this log.
- Coverage added: 30 real PostgreSQL scenarios for role, tenant, project, company, crew, Area and department visibility; grant revocation/inactive holders; active-session and project-membership rejection. Independently compares summary values and exact heat-map cells against explicitly selected fixture populations.
- Validation: baseline TypeScript, 282 tests and production build passed. Opt-in PostgreSQL fixture passed all 30 scenarios. Final automated gate outcome recorded in KPI progress below.
- Scope deviation: opt-in integration fixture lives under tests/beta (existing database-smoke convention), rather than an always-on Reporting unit test; no production implementation or shared fixture file changed. Temporary tables only, one transaction rolled back, no persistent data changes.
- Known gaps: new analytic filters, chart framework and their acceptance remain pending; these query/session checks do not substitute for HTTP tests on every synthetic role combination.
- Production behavior changed: no.
- Batch 32 final gate confirmation: TypeScript, 282 tests and production build passed after the final fixture change; no preview replacement needed.

### 2026-09-30 — Batch 33 (authorization-aware KPI filters)
- Intent: IMPLEMENTER in Reporting; continue the original KPI objective by applying validated operational filters after server-resolved visibility.
- Files touched: reporting/application/metrics-filters.ts and amelia-metrics.ts; reporting/infrastructure/metrics-filter-clause.ts and amelia-metrics.reader.ts; lib/metrics-query.ts; api/projects/[projectId]/metrics/route.ts (one route); tests/reporting/amelia-metrics.test.ts; tests/beta/scoped-metrics-postgres.ts and sabine-metrics-http.mjs; KPI progress and this log.
- Behavior: strict Area/type/status/personnel/population/date filters, inclusive UTC timestamp ranges, same filtered CTE for summary and heat map, explicit supervisory personnel-filter guard and capability metadata. Requester/IM/read-only/admin personnel filtering is rejected; existing authorized request scope cannot expand. Default remains all dates.
- Validation: baseline TypeScript/282 tests/build; final TypeScript/285 tests/build; 39 temporary-fixture PostgreSQL scenarios; 113 read-only HTTP assertions across six accounts. No persistent database or attachment changes.
- Scope deviation: one boundary parser and the existing metrics API route claimed alongside Reporting for end-to-end input and authorization enforcement. No other domain module changed; no workflow mutations, migration or audit event needed.
- Known gaps: controls/chart framework, facets/series and source-quality-aware turnaround are not yet implemented. Personnel-analysis policy for broader non-survey management roles is not inferred. Full goal remains active.
- Production behavior changed: yes, filtered read-only KPI API. Local web preview updated, no commit or push.

### 2026-09-30 — Batch 34 (bounded shared chart data and coverage)
- Intent: IMPLEMENTER in Reporting, preserve one authorization/filter path for all upcoming KPI renderers without downloading detail datasets.
- Files touched: reporting/application/amelia-metrics.ts; reporting/infrastructure/amelia-metrics.reader.ts; api/projects/[projectId]/metrics/route.ts (one route); tests/reporting/amelia-metrics.test.ts; tests/beta/scoped-metrics-postgres.ts and sabine-metrics-http.mjs; KPI progress and this log.
- Behavior: opt-in chart contract with count/eligible-cycle values, bounded category/heat-map/monthly series and authorized facets. Server omits personnel data for non-supervisory roles. Zero-filled monthly series, explicit truncation and source coverage. Turnaround excludes synthetic, missing and negative timestamp pairs; aggregate totals remain complete.
- Validation: baseline TypeScript/285 tests/build; final 286 regular tests and 46 real PostgreSQL fixture scenarios passed; production build and 144 six-account HTTP assertions passed. Historical aggregate payload 12,117 bytes/94 ms local sample, 14,506 eligible cycle samples; full evidence in KPI progress.
- Scope deviation: existing metrics API view parameter added alongside Reporting; no other domain module changed. No workflow mutation, migration, record rewrite or audit event. Data/attachment volumes preserved; only labeled local web image replaced.
- Known gaps: renderers, controls, visible coverage labels and filtered detail drill-down integration are still pending. Full original objective remains active. No commit or push.
- Production behavior changed: yes, bounded opt-in KPI chart data and corrected turnaround eligibility.

### 2026-09-30 — Batch 35 (interactive KPI explorer)
- Intent: IMPLEMENTER; consume the scoped aggregate contract in the existing queue-health pop-out with reusable chart renderers and bounded request drill-downs.
- Files touched: components/ui/operations-health.tsx, kpi-explorer.tsx, kpi-charts.tsx, kpi-explorer.css; lib/apiClient.ts and ticket-list-query.ts; ticket/application/query-filters.ts; ticket/infrastructure/ticket-filter-clause.ts and review-query.ts; reporting/application/amelia-metrics.ts and infrastructure/amelia-metrics.reader.ts; tests/ticket/query-filters.test.ts and review.test.ts; tests/reporting/amelia-metrics.test.ts; tests/beta/scoped-metrics-postgres.ts and sabine-metrics-http.mjs; docs/KPI_EXPLORER_BRIEF.md, KPI_PERFORMANCE_PROGRESS.md, this log and the matching Impeccable surface brief.
- Behavior: lazy-loaded heat, bar, monthly trend, donut and population-share gauge; applicable grouping and filters; explicit scope/date/unit/coverage labels; loading/error/retry/empty states; filtered request drill-down with selectable page sizes. Turnaround excludes inappropriate donut/gauge views. Gauge denominator retains all other filters while removing the selected population restriction; it is not an SLA or productivity score.
- Validation: baseline TypeScript/286 tests/build; final TypeScript/287 tests/build; 47 temporary PostgreSQL scenarios; 170 read-only HTTP assertions. Headless Edge verified all chart choices, deferred aggregation, switching without refetch, detail drill-down, pagination, cycle choices, empty/error recovery, Escape and focus return, desktop/mobile overflow and zero JavaScript errors. Historical regression passed 120 assertions before the final UI-only refinement. Latest historical chart sample: 12,141 decoded bytes/99 ms local, not a production percentile.
- Scope deviation: sequential Ticket query-filter changes support detail/aggregate equality alongside Reporting and shared UI. No API route file changed in this batch. No migration, workflow mutation, audit-event change, imported record rewrite or project lifecycle change. Replaced only the labeled local preview web container; database and attachment volumes retained.
- Known gaps: independent finish review/documentation confirmation pending below; explorer currently mounted in Survey Operations, not requester/field landing pages. Broader role-policy decisions, authority staffing UI and final objective acceptance remain outstanding. No commit or push.
- Production behavior changed: yes, read-only explorer and narrowing request filters.
- Finish confirmation: independent Impeccable review requested one material correction (reused donut colors). Corrected to five largest categories plus expandable Other when needed, preserving exact category counts/shares and drill-downs. Reviewer verdict: ship for the scored fix, resolved. Final TypeScript/287 tests/build and browser acceptance passed, including Other-category drill-down. Read-only documenter compared the implementation with the incumbent and preserved DESIGN.md and its sidecar.

### 2026-09-30 — Batch 36 (requested development checkpoint)
- Intent: save the completed local Sabine simulation, Axiom UI, historical review, load-performance and scoped KPI work on the current phase5 branch.
- Checkpoint scope: implementation, tests, runtime scripts, brand/font assets and licenses, design briefs and work logs from the preceding development batches. Original exports, private .data runtime credentials, generated screenshots and TypeScript build cache are excluded.
- Validation: refreshed production-image gate runs TypeScript and all 287 tests; Batch 35 records the PostgreSQL, HTTP and browser acceptance evidence. No new production behavior in this checkpoint step.
- Publication constraint: fetched origin/phase5 at 47da5ba (style: polish Amelia beta frontend), one commit beyond local base 68e9167. Its shared UI changes overlap this checkpoint. Save locally; do not force-push, merge or silently overwrite that remote work. Reconciliation direction is required before publication.
- Known gaps: the broader objective remains incomplete as recorded in KPI_PERFORMANCE_PROGRESS.md. This is a recoverable development checkpoint, not a release or completion claim.

### 2026-09-30 — Batch 37 (phase5 checkpoint reconciliation)
- Intent: align the requested checkpoint with the newer 47da5ba phase5 frontend commit before GitHub publication.
- Files touched: this append-only log; auth layout, Survey Operations page, global CSS, and project navigation during conflict resolution. The Axiom branding and bounded operations workspace remain the current product direction; the remote skip link, navigation semantics, Card heading structure, and ticket detail naming remain integrated.
- Behavior added/changed: no new workflow behavior. Retained the remote accessibility improvements that apply to the current components and preserved the newer Axiom presentation and KPI explorer.
- Validation: local TypeScript and production build passed. Native Windows test run passed 286 of 287 tests; the sole failure is the existing Unix 0600/0700 attachment-mode assertion under Windows, documented in audits/windows-attachment-permissions.md. The Linux Docker engine and WSL were unavailable for this reconciliation run; the pre-rebase Linux image gate passed all 287 tests. Staged whitespace check passed except verbatim upstream OFL license whitespace.
- Scope deviation: cross-cutting UI conflict resolution was necessary to publish the earlier checkpoint on the current branch; no migrations, ticket state changes, or fixture records were touched.
- Known gaps: the active development objective remains incomplete as recorded in KPI_PERFORMANCE_PROGRESS.md. A fresh Linux test run should be completed when its runtime is available.
- Production behavior changed: existing presentation and accessibility changes combined; no new mutation path.

### 2026-09-30 — Batch 38 (role-specific KPI entry)
- Intent: IMPLEMENTER; extend the shared, server-scoped KPI explorer to Requester and field workspaces without loading chart data on ordinary page visits.
- Files touched: Requester My Requests and field Crew Work pages; scoped-kpi-entry.tsx/.css; kpi-explorer.tsx/.css; PRODUCT.md, DESIGN.md, KPI_EXPLORER_BRIEF.md, KPI_PERFORMANCE_PROGRESS.md and this append-only log.
- Behavior added: compact chart entry and accessible pop-out on both routes; audience-appropriate KPI choices/default charts; self-contained heat/detail/pagination styling and mobile Requester control layout. Existing server authorization and bounded drill-down remain unchanged.
- Validation: final TypeScript and production build passed. Native Windows tests passed 286/287, with only the documented Unix attachment file-mode mismatch; Docker/WSL unavailable for a new Linux gate. Mocked desktop/mobile browser checks verified lazy chart request, restricted choices, close behavior, no overflow and no page errors. The mocks do not replace live authorization tests.
- Scope deviation: two existing UI routes and shared components/styles changed together for the same role-entry feature; no domain module, API route, migration, state transition or audit-event path changed. No new automated test file was added; browser acceptance was run from an ignored local script.
- Known gaps: full objective and real Sabine preview acceptance remain pending; Survey Manager staffing workflow is separate and unfinished. No imported data or project lifecycle changes.
- Production behavior changed: yes, read-only on-demand chart access on two additional role routes.
- Finish review: independent Impeccable reviewer returned Ship with no material UI blocker after inspecting four final captures and the code diff; this is not a live-backend authorization verdict.
- Documentation check: independent read-only comparison found Axiom alignment and requested a narrow record of the two new role entry points; updated product, design and KPI brief text without changing tokens or the design sidecar.

### 2026-09-30 — Batch 39 (bounded role work queues)
- Intent: IMPLEMENTER in Ticket with claimed shared query parser and three role routes; prevent early list pages from hiding later actionable or submitted requests.
- Files touched: ticket/application/query-filters.ts and infrastructure/ticket-filter-clause.ts; lib/ticket-list-query.ts; Crew Work, Crew Approvals and My Requests pages; tests/ticket/query-filters.test.ts; KPI_PERFORMANCE_PROGRESS.md and this log.
- Behavior added: `fieldWork` and `pcApprovals` server queues select their actionable states after existing visibility; both crew pages use bounded, selectable server pages and refresh after actions. My Requests uses existing `queue=all` so draft exclusion applies to both count and page at the data layer.
- Validation: baseline TypeScript/build pass and 286/287 native Windows tests; final TypeScript/build pass, focused Ticket query tests 7/7, native Windows tests 287/288 with the same pre-existing Unix attachment-mode mismatch. Mocked 390px browser checks verified all three queue parameters, both crew pages' offsets/row-size changes, no overflow or page errors. No new Linux or live-data run while Docker/WSL were unavailable.
- Scope deviation: one shared Ticket query parser and three existing role UI pages changed alongside Ticket query code; no API route file, migration, workflow transition or audit event changed. Local browser acceptance script is ignored evidence, not a portable automated test.
- Known gaps: full-objective acceptance, real-data review and separate Survey Authority staffing/dashboard policy remain pending.
- Production behavior changed: yes, server-filtered personal/field work/approval pages and crew pagination.
- Finish review: independent Impeccable review returned Ship without a material UI blocker; mocked-browser evidence remains separate from live authorization/data proof.

### 2026-09-30 — Batch 40 (draft page population alignment)
- Intent: IMPLEMENTER in Ticket's Requester route; make Drafts count and page use the same DRAFT population rather than hiding non-drafts after pagination.
- Files touched: Requester Drafts page; tests/ticket/query-filters.test.ts; KPI_PERFORMANCE_PROGRESS.md and this log.
- Behavior added: use the existing server-side `status=DRAFT` filter and display the returned bounded page directly. The repository's existing visibility predicate remains the outer scope.
- Validation: TypeScript and production build pass; targeted bound-filter test added. Native Windows tests are 288/289, with only the pre-existing Unix attachment file-mode assertion failing. Mocked 390px browser request-shape check passed without overflow or page errors. Fresh Linux and real-data acceptance remain unavailable while Docker/WSL are down.
- Scope deviation: Requester UI and its directly tied Ticket test changed; no production domain, API route, migration, state transition or audit event changed.
- Known gaps: separate Survey Authority dashboard/staffing decisions and full-objective acceptance remain pending.
- Production behavior changed: yes, Drafts count/page now match the server-filtered DRAFT population.

### 2026-09-30 — Batch 41 (Superintendent crew-scope decision)
- Intent: record the owner's authorization decision before changing Survey Authority dashboard or staffing code.
- Files touched: PRODUCT.md, KPI_PERFORMANCE_PROGRESS.md and this append-only log.
- Decision: Superintendent dashboard crew scope requires an explicit Manager-assigned Superintendent → Party Chief relationship intersected with authorized Areas; Area overlap or historical ticket assignment is insufficient evidence.
- Validation: documentation-only change; TypeScript passes and native Windows tests remain 288/289 with the same documented attachment permission-mode failure.
- Known gaps: individual links, unassigned-work population, and whether CLAUDE.md §15 may be amended to allow the requested Survey Team staffing UI remain unresolved. No relationship table, API, menu, role grant or metric scope changed.
- Production behavior changed: no.

### 2026-09-30 — Batch 42 (Superintendent personnel analytics fail-closed)
- Intent: IMPLEMENTER in Reporting; enforce the owner's explicit reporting-link rule without inferring crew ownership from Area scope.
- Files touched: reporting/application/metrics-filters.ts; tests/reporting/amelia-metrics.test.ts; tests/beta/scoped-metrics-postgres.ts; KPI_PERFORMANCE_PROGRESS.md and this log.
- Behavior added: Superintendent request counts remain Area-scoped, but personnel filters are rejected before querying and chart personnel groups/facets are omitted until an explicit Manager-assigned Party Chief relationship exists. Survey Manager and Party Chief behavior is unchanged.
- Validation: baseline TypeScript pass, native Windows tests 288/289. Final TypeScript and production build pass; focused Reporting tests 9/9; native Windows tests 288/289 with only the documented Unix attachment-mode assertion. PostgreSQL fixture assertions were added but not run because Docker/WSL were unavailable.
- Scope deviation: opt-in PostgreSQL fixture follows the repository's existing tests/beta convention; no API route, migration, ticket visibility predicate, ticket state or audit event changed.
- Known gaps: explicit relationship persistence/mutation/UI, unassigned-work rule, real PostgreSQL/HTTP recheck and full Survey Authority dashboard remain pending.
- Production behavior changed: yes, narrower read-only personnel analytics capability for Superintendents.

### 2026-09-30 — Batch 43 (recorded command activity foundation)
- Intent: IMPLEMENTER in Reporting; add truthful daily demand-versus-completion aggregates for the planned Survey Manager command overview while retaining current-state backlog separately.
- Files touched: reporting/application/command-activity.ts and infrastructure/command-activity.reader.ts; metrics API route; lib/apiClient.ts; tests/reporting/command-activity.test.ts; CLAUDE.md, LEAD_DECISION_LOG.md, PRODUCT.md, KPI_PERFORMANCE_PROGRESS.md and this log.
- Behavior added: manager-only `view=activity` endpoint with default 30-day, maximum 90-day UTC event series; first-submission counts, recorded completions excluding generated dates, and source exclusion count. Visibility is resolved by the server before bound operational filters. No ticket details, state changes or fabricated activity are returned. The owner-approved narrow fixed-role staffing exception is now explicit in the spec; onboarding authority remains unresolved.
- Validation: baseline TypeScript pass, native Windows tests 288/289. Final TypeScript and production build pass; focused activity tests 4/4 and Windows suite 292/293, with the same known Unix attachment-mode failure. Docker was unavailable, so real PostgreSQL execution, HTTP acceptance and query timing for this new endpoint remain open.
- Scope deviation: one Reporting use case/reader plus one claimed metrics route and shared typed API client, directly tied to this endpoint. Documentation changes resolve the earlier narrow staffing deferral. No migration, UI, role enum, workflow transition or audit event changed.
- Known gaps: command UI does not yet consume this series; Superintendent crew links and staffing workflow, unassigned-work policy and live SQL/HTTP performance proof remain. The full development objective is active.
- Production behavior changed: yes, new read-only aggregate endpoint; no existing response shape changed.

### 2026-09-30 — Batch 44 (Survey Manager command overview)
- Intent: IMPLEMENTER in Survey Operations; provide the requested Axiom command dashboard without inferring productivity or expanding role scope.
- Files touched: Survey Operations page, new command overview and view-link helper, shared KPI chart/styles, Project Review URL tab handling, metric status typing, helper tests, PRODUCT/DESIGN traceability, KPI_PERFORMANCE_PROGRESS.md and this log.
- Behavior added: default Overview tab with current-status donut, recorded daily demand/completion trend, switchable Area/type/Party Chief bars, coordinated filters, authorized request-list drilldowns, and deferred queue-page fetch until its tab is selected. Activity dates never silently narrow all-time backlog counts.
- Validation: TypeScript and production build pass; drilldown helper 2/2; native Windows tests 294/295 with only the pre-existing Unix attachment-mode mismatch. Mocked desktop/mobile browser acceptance verifies no overflow/JS error, no initial ticket-page fetch, date-only activity refetch, and request-list drilldown. Independent Impeccable finish review: Pass, no material blocker.
- Known gaps: the browser used mocked API payloads; real PostgreSQL/HTTP activity execution and performance evidence await a container/database runtime. Manager staffing and explicit Superintendent reporting links remain unimplemented; unassigned-work policy is awaiting owner direction.
- Production behavior changed: yes, Manager overview and read-only Project Review tab deep link; no role grant, ticket state, imported record, or project lifecycle changed.

### 2026-09-30 — Batch 46 (fixed-role Survey staffing foundation)
- Intent: IMPLEMENTER in Tenancy; lay the explicit, audited Manager staffing transaction without extending account invitations or general admin role editing.
- Files touched: migration 024, Tenancy staffing use case/repository, manager-only Survey staffing API route, focused tests, PRODUCT.md, CLAUDE.md, LEAD_DECISION_LOG.md, KPI_PERFORMANCE_PROGRESS.md and this log.
- Owner decision: the Manager may select existing project members only; IT retains account invitation authority. Compatible role replacement requires explicit confirmation.
- Behavior added: atomic Manager-only Party Chief/Area/Superintendent/Instrument Man assignment, Full/Medium/Slim build validation, explicit Superintendent Area-coverage check, conflicting crew/Area rejection, affected-user session invalidation and an append-only project staffing event. The new reporting-link table is not yet consumed by Superintendent analytics.
- Validation: focused staffing tests 7/7 and TypeScript pass. PostgreSQL migration/API execution and live authorization/performance checks are pending a database runtime; no UI acceptance claim is made for this batch.
- Known gaps: Manager-facing staffing form/menu, read path, explicit Superintendent personnel metric intersection, unassigned-work policy and full acceptance remain open.
- Production behavior changed: yes, a new narrowly authorized API write endpoint and migration; no ticket state or imported record was changed.

### 2026-09-30 — Batch 47 (red-team checkpoint verification and Team Management handoff)
- Intent: close the documentation gap for security commit `f01040b`, verify the current clean source baseline, and capture the owner's expanded Team Management brief before changing persistent structures.
- Prior production files: security checkpoint changed Identity session/reset paths and workers, Attachment body/storage limits, Ticket priority concurrency and project-scoped AOR validation, tenant diagnostics, login return-path handling, Compose/environment/deployment guidance, migrations 025–027 and the duplicate-constraint correction in 024, with directly tied regression tests. See `git show --stat f01040b` for the exact 73-file list; this entry does not introduce additional production changes.
- Security behavior: no API/console reset bearer disclosure; cooldown and durable known-account/source limits; encrypted reset-email outbox decouples transport latency; concurrent reset consumption is guarded; logout revokes only the presented token; protected entry points check revocation; upload body size is bounded before multipart parsing/storage; priority writes use stale-state guards; AOR lookup checks tenant and project; diagnostics omit global job rows; login accepts local return paths only; Compose binds loopback with production settings.
- Migration evidence: prior fresh isolated PostgreSQL application reached 024's duplicate AOR composite constraint, which was removed because 022 already creates it; 024–027 then applied successfully. Sabine data was not reset or rewritten. This proves migration execution, not full live HTTP security acceptance.
- Validation this checkpoint: all 317 native Windows tests pass, TypeScript passes, and production build passes. Initial sandbox typecheck could not write `tsconfig.tsbuildinfo`; the write-authorized rerun passes. Existing unit tests now handle Windows versus POSIX attachment permission semantics explicitly.
- Residual risks: without trusted ingress/source-level limiting, arbitrary unknown-email recovery requests still incur database lookup load. Public deployment requires trusted `X-Real-IP` handling and ingress request limiting. Usable recovery also requires webhook delivery and the worker; the console transport intentionally does not disclose or discard reset links. The running local preview remains an earlier image, not this security checkpoint. Broader security/runtime acceptance is not claimed complete.
- New owner scope: Team Management includes fixed Superintendent/Party Chief/Instrument Man role assignment/change/removal and named team CRUD with Area, member lead and personnel availability. Recorded all acceptance requirements and current-model conflicts in `TEAM_MANAGEMENT_INCREMENT.md`.
- Owner decisions received: one active named team per person/project; teams are organizational groups with explicit authority/reporting links kept separate; removal of a survey role retains project membership as Requester. No team migration/UI or authorization expansion is included in this checkpoint.
- Known gaps: Team Management increment, staffing read/UI and reporting integration, real-data dashboard/HTTP/performance acceptance, and the full original objective remain unfinished. The owner requested this clean checkpoint before prioritizing Team Management; no merge is authorized.
- Files touched in this documentation increment: `TEAM_MANAGEMENT_INCREMENT.md`, `KPI_PERFORMANCE_PROGRESS.md`, and this append-only log.
- Production behavior changed in this increment: no.

### 2026-09-30 — Batch 48 (named organizational team server foundation)
- Intent: IMPLEMENTER in Tenancy after clean checkpoint `5025e2d`; implement the confirmed named-team persistence, bounded reads and atomic Manager-only CRUD without changing operational authority/reporting.
- Files touched: migration 028; Tenancy `survey-teams.ts` and `survey-teams.repository.ts`; claimed Survey teams API handler/route; focused Tenancy tests and opt-in isolated PostgreSQL fixture; CLAUDE.md, Decision 13, TEAM_MANAGEMENT_INCREMENT.md, KPI_PERFORMANCE_PROGRESS.md and this log.
- Behavior added: named teams with existing Area, current member lead, up to 100 selected active survey-role project members, one active team per person, case-insensitive active-name uniqueness, versioned edits and confirmed soft deletion. Bounded searchable summary/personnel pages and selected-team details keep response populations small. Removed members remain historical rows and can join another active team; archived projects cannot be mutated.
- Authorization: only an authenticated current project Survey Manager may read/mutate these endpoints. Mutations recheck and lock current Manager membership/session, tenant/project, active Area and member roles. Team membership grants no Area/reporting/crew/tenant permission and changes no ticket assignment. Reused the existing idempotency ledger and enforce authorization before replay; stale writes and audit failures abort the transaction.
- Validation: fresh isolated PostgreSQL migration application 001–028 passes; 35 PostgreSQL/route-handler cases pass, including cross-project/tenant/role/session denial, copied-token revocation, idempotency replay/mismatch/lost-role replay, duplicate names, foreign members/Areas, lead protection, audit rollback, edit races and exclusive-membership races. Final TypeScript, all 327 tests and production build pass; no browser acceptance or Sabine deployment is claimed. Only the verified disposable test container/database was removed after testing; all Sabine data/volumes were retained.
- Schema: added tenant/project-bound `survey_teams` and `survey_team_members`, soft-deactivation history, partial unique indexes, foreign keys and deferred lead-member FK; expanded the existing project event-type check. No existing data is migrated into teams or reporting relationships inferred.
- Scope deviation: one logical migration and one claimed API resource plus its handler/test paths. New project-event names are documented in CLAUDE.md §12 in this batch; no ticket event enum or ticket workflow was changed.
- Known gaps: supported-role assignment/change/removal, Team Management menu/UI, explicit reporting controls, deployed/browser acceptance and complete original KPI/performance acceptance remain. `survey.role_changed` is reserved in the schema, not yet emitted. This is a server foundation checkpoint, not completion of the bounded feature.
- Production behavior changed: yes, new optional server team-management resource; the existing local preview is unchanged.

### 2026-09-30 — Batch 49 (fixed operational role changes and concurrency verification)
- Intent: IMPLEMENTER in Tenancy; implement the owner's fixed-role assignment/change/removal policy using existing project memberships, with Requester retained after removal.
- Files touched: new Tenancy `change-survey-role.ts`; existing team application/repository; claimed teams API handler/route; focused team/role tests and isolated PostgreSQL fixture; TEAM_MANAGEMENT_INCREMENT.md, KPI_PERFORMANCE_PROGRESS.md and this append-only log.
- Behavior added: Manager-only PATCH set-role command for supported Superintendent/Chief/IM/Requester targets and eligible existing active project members, with crew-build compatibility, explicit confirmation, expected role/account version, idempotency, atomic session invalidation and `survey.role_changed`. Protects Manager/admin/unrelated roles and foreign/inactive subjects. A no-op produces no audit or session change. No tenant roles, identities, invitations, ticket history or workflow state change.
- Reference protection: survey-role removal requires prior named-team removal/lead replacement; any active reporting/crew/Area/responsibility/acting obligation must be explicitly resolved before any role change. Supported survey-role changes may retain organizational team membership, never automatic authority/reporting grants. Existing historical ticket assignments remain unchanged.
- Concurrency evidence: a synchronized two-project Manager/subject test reproduced a database deadlock. Holding only the current Manager membership authority lock and using stable `FOR NO KEY UPDATE` subject account/membership locks resolves both actor/subject inversion and audit-FK key-share conflict. Manager active session is checked at authorization, not serialized through a global caller-account lock; future requests remain subject to revocation checks.
- Validation: baseline 327 tests and TypeScript pass. Final all 334 tests, focused team/role 17 tests, TypeScript and production build pass. Fresh isolated PostgreSQL migrations 001–028 and 56 real database/in-process route-handler scenarios pass, including role/session audit rollback, idempotency, protected/foreign/inactive subjects, all obligation guards, stale same-subject race and simultaneous cross-project changes. No deployed HTTP/browser acceptance is claimed.
- Schema: no additional migration; uses existing single project-role column, user session version and migration 028's documented role-event allowlist. No broad membership endpoint relaxation or new permission model.
- Known gaps: Team Management screen/menu, Manager-facing explicit obligation cleanup/reporting controls, deployed/browser acceptance, Superintendent personnel scope integration and the full original KPI/performance requirement audit remain open. The running Sabine preview is not rebuilt for this checkpoint.
- Production behavior changed: yes, narrowly scoped role-management server command; Sabine data remains unchanged.

### 2026-09-30 — Batch 50 (Manager Team Management screen and real-stack acceptance)
- Intent: IMPLEMENTER in Tenancy-backed Survey UI; expose the approved bounded team/fixed-role flows through existing Axiom project navigation without granting organizational membership operational authority.
- Files touched: new Team Management route/component/CSS and view helper; claimed project navigation/API client; existing teams application/repository/GET handler; focused Tenancy/UI tests and opt-in PostgreSQL/browser/live-stack fixtures; PRODUCT.md, development-only surface brief, TEAM_MANAGEMENT_INCREMENT.md, KPI_PERFORMANCE_PROGRESS.md and this log.
- Behavior added: Manager-only Personnel/Teams tabs, bounded name/email/role and team/Area search with page-size controls, existing-member fixed-role confirmation/removal to Requester, team name/Area/member-lead/member create/edit, confirmed deletion, retained selection across search pages, disabled elsewhere members, protected lead removal and read-only archived details. New context/Area read modes do not take mutation locks or fetch requests. Server remains the authorization boundary. Active operational obligation cleanup/reporting controls are not yet provided by this screen.
- Resilience/accessibility: scoped context denial prevents personnel fetch; page/query changes discard stale results; retry/error/empty/loading states; uncertain mutation retries reuse their key for unchanged payloads; keyboard tabs; native Area disclosure collapses after selection; opening replacement tasks focuses their heading and cancellation restores the stable workspace heading. No new shipping raster or design-token system.
- Validation: baseline 334 tests and TypeScript pass. Final 338 tests, TypeScript and production build pass. Fresh isolated migrations 001–028 and 63 PostgreSQL/in-process route scenarios pass, including context/Area isolation, retired Area exclusion and human-readable role search. Mocked production browser acceptance at 1440px/390px covers flows, selection persistence, idempotent retry, closed/denied access, errors and keyboard entry/cancellation without overflow or page errors. Six current captures were opened and validated.
- Independent design evidence: initial Impeccable review returned fix for keyboard focus handoff only; that correction was applied in one batch and its verdict pass scored the finding resolved, disposition ship. This verdict does not certify the overall product objective. The documentation handoff found an ordinary extension with no new durable guidance or scoped drift: DESIGN.md and the design sidecar remain unchanged. Incumbent Axiom styling was preserved; shipping PNG hashes match their supplied sources, and Roboto/OFL provenance remains intact. No new brand assets or tokens were introduced.
- Actual runtime evidence: production server on separate loopback 3107 connected only to gated disposable PostgreSQL; real HTTP role/tenant/stale-session denials, team create/edit/read/delete and unmocked browser role promotion/removal pass. Eleven sampled HTTP requests range 10–77 ms on the small local fixture, not a production KPI benchmark. No Sabine record, volume or running preview was changed.
- Scope deviation: directly tied frontend/client/navigation and multiple opt-in acceptance fixtures accompany the one owned teams API resource. No new migration, identity system, tenant permission, ticket reassignment or general admin endpoint relaxation.
- Known gaps: Manager-facing explicit operational obligation cleanup/reporting controls, Superintendent personnel KPI scope integration, Sabine deployment/real-data acceptance and the full original KPI/performance completion audit remain. Existing staffed members remain guarded from role changes until obligations are explicitly resolved.
- Production behavior changed: yes, a new bounded Manager UI and read variants; local Sabine preview is still the older build.

### 2026-09-30 — Batch 51 (bounded explicit staffing snapshot)
- Intent: IMPLEMENTER in Tenancy; close the read prerequisite for the previously approved Manager Chief/Area/Superintendent/IM staffing flow without inferring operational authority from named teams or ticket history.
- Files touched: new `read-survey-staffing.ts`; existing `survey-staffing.repository.ts`; claimed staffing route/handler; focused staffing-read unit/handler tests, isolated PostgreSQL and actual HTTP fixtures; TEAM_MANAGEMENT_INCREMENT.md, KPI_PERFORMANCE_PROGRESS.md and this append-only log.
- Behavior added: authenticated current Survey Manager reads one active project Chief's current explicit Area assignments/reporting link and a bounded searchable roster. One snapshot SQL query returns at most 100 distinct assigned Areas with total/truncation, roster pages of 10/25/50/100 and matching versus full roster totals. Inactive linked personnel, missing/changed roles and retired Areas are explicitly flagged for cleanup; they confer no authorization. Closed projects remain readable. Other roles, tenants/projects, stale sessions, malformed/duplicate/unknown query parameters and excessive pagination are denied.
- Validation: baseline 338 tests and TypeScript pass. Final 345 tests, TypeScript and production build pass; the fixture's initial missing TypeScript parameter annotation was corrected before the passing rerun. Fresh isolated migrations 001–028 and all 63 existing team scenarios pass, followed by 23 real PostgreSQL/in-process staffing-read scenarios. Ten actual production HTTP scenarios pass on separate loopback 3107 against only the fixture. Local requests were 6–140 ms with a 140 ms first request, not a production-scale benchmark. No browser/UI acceptance is claimed for this backend-only increment.
- Scope deviation: one claimed staffing API resource plus its handler, directly tied test fixtures and documentation. No schema migration, write use-case change, UI change, event addition, ticket/grant mutation or cross-module domain-table access. No unrelated shared infrastructure edits.
- Preservation: current POST contract remains unchanged; no role/Area/reporting relationship is automatically granted, detached or migrated. The test fixture alone creates synthetic linked/inactive/retired data. Only its verified disposable container/database was removed after acceptance, and it can be recreated from the gated fixture. Sabine records, volumes, credentials and preview were untouched.
- Known gaps: Manager-facing explicit staffing/obligation cleanup controls and operational stale-write/idempotency acceptance, Superintendent personnel KPI intersection, individual Sabine links and unassigned-work policy, preview deployment and the full original KPI/performance completion audit remain. This local increment follows clean pushed checkpoint `2d0465a`; it is not another completed product checkpoint.
- Production behavior changed: yes, a bounded Manager-only read endpoint; current preview not rebuilt.

### 2026-09-30 — Batch 52 (separate Superintendent workload and linked-crew KPIs)
- Intent: IMPLEMENTER; implement owner Decision 14, retaining Area-wide unassigned/unlinked workload separately from personnel analytics backed by explicit reporting links intersected with authorized Areas.
- Files touched: Tenancy linked-crew read use-case/repository; Ticket visibility/filter contracts and repository; Reporting filters/use-case/reader; claimed shared visibility/query/client helpers; metrics and ticket-list GET routes; existing KPI explorer/Operations UI/navigation; focused reporting/navigation tests and gated PostgreSQL/HTTP/browser fixtures; PRODUCT.md, surface brief, decision/progress documentation and this log.
- Behavior: `cohort=areaWorkload|linkedCrews` is opt-in and Superintendent-only. Missing cohort preserves existing Area-wide scope. Linked scope resolves active explicit Superintendent-to-Chief links, active current fixed-role memberships/non-subcontractor users, active link roots and authorized descendants. Named teams, imported leadership snapshots and IM rosters do not infer links. Each Chief/Area pair is bound in the shared SQL visibility fence; totals, gauge denominator, chart series, facets and bounded request drill-downs narrow the same population. Empty or revoked links deny all linked rows. Other roles cannot select a Superintendent cohort, and unresolved/mismatched fences are rejected before list/aggregate SQL. No schema or grant mutation.
- UI: native Workload view select, explicit scope copy, honest no-link recovery, personnel choices only in linked scope, common-filter retention/personnel-filter clearing on view changes, scoped bounded details and same-cohort reset/measure changes. Initial Overview reuses its aggregate, not the Manager-only activity endpoint. The Superintendent receives a Survey Operations navigation link without changing its existing landing destination; its Area-wide queues are read-only links to requests for existing applicable actions, with no Manager assignment controls or local-message tab. Manager and other-role flows retain their existing behavior.
- Validation: baseline 345 tests/TypeScript pass; final 356 tests, TypeScript and production build pass. An initially empty unit mock and exact-label/lazy-page browser locator issues were corrected rather than weakening assertions. Fresh disposable migrations 001–028 plus all 63 existing team cases pass, followed by 20 real PostgreSQL aggregate/list/isolation/revocation cases and 15 actual production HTTP cases. Unmocked production browser acceptance at 1440/390 verifies one initial aggregate, no initial ticket download or activity call, 7 Area-wide versus 3 linked requests, exact linked details, five presentation switches without aggregate downloads, filter/reset/measure scope retention and retry. Final navigation/read-only and zero-link UI acceptance is recorded below after confirmation.
- Scope deviation: sequential coordinated Tenancy read, Ticket predicate and Reporting consumers are necessary for a single approved population contract; two existing GET resources and directly related shared UI/client/navigation files are claimed. Existing mutations, permission grants, staffing POST behavior, imported records and lifecycle statuses are unchanged. No unrelated-module refactor or dependency was added.
- Limits: these are small synthetic isolated fixtures, not full-size Sabine performance evidence. Individual Sabine reporting links are still unassigned and must not be inferred. Manager operational staffing/obligation cleanup, preview deployment and the full original objective audit remain unfinished. Sabine's running preview/data/volumes are unchanged.
- Final confirmation: all 15 production HTTP cases and unmocked desktop/mobile browser checks pass after the navigation/read-only correction. The browser additionally verifies no Superintendent roster/message calls or Save Assignment control, retained Workload view during error/retry, and explanatory zero-link recovery (that zero-link screenshot uses a synthetic response). Five final captures were opened and validated. The one Impeccable detector pass returned no findings; it was not repeated. The independent fresh finish reviewer returned `ship`, no material fixes, covering only this Superintendent UI extension. Only the verified disposable test database/container and its test server were removed; the tracked gated fixtures recreate them. Sabine containers and volumes were preserved.
- Documentation handoff: the independent read-only documenter inspected the final targets, incumbent CSS/system files, PRODUCT/Decision 14/surface contract and all five captures. It found an ordinary Axiom extension, no new durable guidance or scoped drift, and confirmed DESIGN.md and `.impeccable/design.json` can remain unchanged. It did not rerun runtime tests or certify broader drift cleared. Batches 51–52 form this coherent development checkpoint, not full-objective completion or Sabine deployment.

### 2026-09-30 — Batch 53 (personal navigation, compact historical charts and preview)
- Intent: IMPLEMENTER, UI-only ordinary Axiom extension implementing the owner's annotated browser feedback (Decision 15), followed by deployment of the verified current phase5 source to the existing owned Linux preview.
- Files touched: claimed projects layout, AccountShell/component CSS and ProductBrand greeting prop; ProjectReview/CSS and new presentation-only ReviewChartLane; synthetic four-width and opt-in real Sabine browser fixtures; existing Sabine metrics fixture's personnel-denial expectation; PRODUCT, source/registered surface briefs, Decision log, KPI progress and this append-only entry. DESIGN.md/sidecar, global tokens, supplied brand/font assets, backend application/API code and migrations are unchanged.
- Behavior: authenticated full-name greeting with honest fallback/error/retry; persistent 280px right navigation column at >=768px pushes main content inward without dismissing on page interaction; phones use native modal drawer/Close/Escape/protected focus and release the modal before returning focus. Existing Home/Profile/Assignment Details/Projects/Sign out retain project context and per-session logout. Historical charts default to one horizontally scrollable row with explicit Previous/Next controls and optional full responsive grid. All four existing charts retain their authorized shared-filter drilldowns, and presentation switches fetch no aggregate data. Report/print exports remain explicitly lower priority and unimplemented.
- Validation: baseline and final 356 tests and TypeScript pass; Windows and Linux production builds pass. Initial acceptance exposed relative chart offsets and modal focus return; corrected before the final passing four-width confirmation. Exact synthetic checks cover 1440/390/810/1559, context, persistent desktop interaction, modal keyboard focus, chart scroll/expand, filtered details, page-size changes, retry/empty, logout failure and long-name wrapping; no overflow/page errors. All 12 final captures were opened. One detector pass returned no primary findings, with advisory literal font-size roles already used by the incumbent system; no second detector. Fresh full finish review returned `ship`, no material fixes, only for this UI extension. Read-only documentation handoff preserved DESIGN.md/sidecar, confirmed durable current surface guidance, and reported older DESIGN.md header/lockup prose without unasked drift repair.
- Preview: built `swrtracker:sabine-ui-20260930`; verified `.data/sabine/backups/ui-20260930/database.dump` (3,560,663 bytes, SHA256 `9595FF07E7DB7779C272B81714A16ED2DF60372097D2A09F210A579628D0495E`) before applying existing additive migrations 024–028 to the verified loopback demo DB. Retained previous owned web container stopped as `swrtracker-sabine-web-before-ui-20260930` for rollback; reused unchanged database/session settings and attachment volume. No destructive cleanup, reset/reseed, source prose restoration or inferred links. Health 200; all 20,109 request IDs/statuses/versions preserve fingerprint `22fcffc03ee306d3b65c8c3eda4997b3` before/after deployment and acceptance.
- Real-data acceptance: 167 HTTP metrics checks across six accounts pass. Existing synthetic request fixture expectation now follows server personnel-filter capability, correctly denying Superintendent personnel selection in Area-wide scope. Historical chart payload 12,198 bytes, sampled110ms loopback (not production load evidence). Unmocked updated-preview browser at810/390 confirms real account greeting, all four historical charts, live queue, project context, logout token revocation and another account session remaining active; no request mutations or page errors. Initial Playwright API-cookie transport mismatch was corrected in the test harness with explicit device-local cookie supply, not by weakening production Secure cookies. Demo/infrastructure credentials were not logged or committed.
- Scope deviation: shared authenticated shell and Ticket read-only presentation are sequenced and directly required by the owner; testing/documentation and owned preview deployment are scoped normal implementation steps. Backend permissions, workflows, data/lifecycle and session policy remain unchanged. Existing schema additions from earlier verified checkpoints were required by the current source, not new feature migrations in this batch.
- Remaining: Manager explicit operational staffing/obligation cleanup, person-level Sabine reporting assignments and full original KPI/performance requirement audit. This coherent refinement/deployment checkpoint does not complete the broader active goal; export backlog is not its replacement.
- Production behavior changed: yes; current local preview now runs the updated Linux image.

### 2026-09-30 — Batch 54 (recorded full-height account overlay)
- Intent: IMPLEMENTER in the authenticated UI shell; implement the owner's accepted overlay recommendation (Decision 16), replacing only the earlier desktop push-column interaction. A preceding read-only AUDITOR assessment documented explicit staffing-editor prerequisites without changing that workflow.
- Files touched: account-menu.tsx/CSS; synthetic and gated real-Sabine navigation fixtures; PRODUCT, account source/registered briefs, Decision log, KPI progress, this append-only log and audits/staffing-editor-readiness-20260930.md. No backend, API, schema, permission, identity artwork, font, global stylesheet or DESIGN/sidecar edits.
- Behavior: one native full-height right modal at all widths, capped at 320px with a backdrop strip on narrow screens; slate dimming, stationary underlying content and body scrollbar compensation. Close/Escape/genuine backdrop clicks dismiss and return focus without scrolling. Inside-to-outside dragging does not dismiss. Persistent dialog DOM and native CSS display/overlay transitions retain a 260ms decelerating entrance and 180ms exit without animation timers or dependencies; rapid reopening interrupts safely. Reduced motion removes spatial travel. Greeting, project-context destinations, historical chart controls and session-only logout are preserved.
- Validation: baseline/final TypeScript and all 356 tests pass; Windows and Linux production builds pass. Five-width synthetic acceptance (1440/390/810/1559/1902, with the recording's 1902x912 dimensions) checks stationary geometry, full-height/right-edge bounds, focus containment/return, dismissal/drag guard, rapid reopening, authored animation timings, reduced motion, scroll retention and existing chart/drill-down/paging/retry/empty/logout-error/long-name behavior. The first run identified a reserved scrollbar gutter at the drawer edge; body compensation corrected it before passing acceptance. Eight settled open/closed captures were opened and validated in the bounded inspection; subsequent timing checks produced no new capture round.
- Review: one Impeccable detector pass returned only retained .875rem/1.125rem font-size advisories, no primary findings. Fresh full finish review included the owner's recording frames and all eight current captures; disposition `ship`, no material fixes, scoped only to this menu extension. Independent read-only documentation review confirmed current contract persistence and incumbent Axiom fit; DESIGN.md/sidecar remain unchanged. Previously reported header-responsiveness and unqualified SWRTracker-lockup prose drift remains, with no unasked repair.
- Preview: Linux image `swrtracker:sabine-menu-20260930`, ID `sha256:581c269116e0b4ddaab79ed11e61f7012332e715013e7446eb12977fb5e32f90`, now runs the owned loopback3106 web container; canonical `swrtracker:sabine-linux` alias matches. Previous web container retained stopped as `swrtracker-sabine-web-before-menu-20260930`, alongside the earlier rollback container. A Windows child-process PATH issue interrupted launch after rename; an explicit guarded resume passed only the three preserved application settings, completing the cutover. No container/volume deletion, DB migration/reset/reseed or account/reporting assignment occurred; session secret and attachment volume are unchanged. Health200; all 20,109 request IDs/statuses/row versions retain prior fingerprint `22fcffc03ee306d3b65c8c3eda4997b3`. An initial read-only fingerprint query used a nonexistent `version` column; corrected to schema `row_version` before recording evidence.
- Actual acceptance: unmocked Sabine browser at810/390/1902 checks historical stationary overlay, four existing charts, live queue, backdrop/focus and Home dismissal, current account greeting and this-session-only logout while another session remains valid. No request mutations or browser errors. Only test login sessions were created/revoked. The separate synthetic acceptance server was stopped; the user's preview remains running. These tests establish interaction correctness, not a frame-rate benchmark or whole-product/security certification.
- Remaining: explicit Manager operational staffing/stale-snapshot/idempotent cleanup controls, individual Sabine reporting assignments and the full original KPI/performance requirement audit. The attached readiness report confirms the existing staffing POST is additive, not roster replacement, and lacks displayed-state concurrency/idempotency contracts. This checkpoint does not complete the broader development objective or implement exports.
- Production behavior changed: yes, the approved account overlay is deployed to the local preview.

### 2026-09-30 — Batch 55 (pinned popout close controls)
- Intent: IMPLEMENTER, UI-only ordinary Axiom extension of the owner's request that every scrollable popout keep Close visible without scrolling back up.
- Files touched: shared popout.css; account-menu.tsx/CSS, operations-health.tsx/operations.css and scoped-kpi-entry.tsx/CSS; opt-in real-Sabine scroll acceptance; PRODUCT, source/registered account/KPI briefs, KPI progress and this append-only log. No backend, schema, API, authority, identity asset or global design-token edits.
- Behavior: all three existing dialog components (account navigation, Queue Health and Requester/field KPI explorers) use a non-scrolling title/Close header and independently scrollable body. Header does not overlay charts, filters or request details. Mobile titles wrap while Close retains its full target. Native modal semantics, Escape, launcher focus restoration, account slide/backdrop/drag guard, lazy analytics loading and scoped data remain unchanged.
- Validation: baseline/final nonincremental TypeScript and all 356 tests pass; Windows and Linux production builds pass with retained autoprefixer end-value warnings. Real production browser acceptance passes eight desktop/mobile cases at1440/390: actual overflow, positive body scroll, exactly stationary Close bounding box with >=44px hit target, outer dialog scrollTop0, viewport-contained Close, no page overflow, click/Escape dismissal and focus return. Short300px account viewports intentionally force menu overflow. All eight settled captures were opened in one bounded inspection. Existing five-width synthetic shell acceptance passes overlay geometry/motion, reduced motion, rapid reopening, keyboard/backdrop/focus, historical charts/filter details/recovery and logout-error cases. One detector scan reported retained font/color advisories and an incumbent selected-tab border warning, not a new popout defect; no repeated scan or global drift repair.
- Review: fresh independent full Impeccable finish disposition ship, all five sections, no material fixes within scope. An unchanged desktop Crew Work Rows label wrap remains outside this header refinement. Source/registered briefs and PRODUCT persist the owner requirement. Documentation comparison preserves DESIGN.md and its sidecar; no new world/token/raster change is introduced. Prior global header/lockup prose drift is not cleared by this task.
- Preview: verified Linux image swrtracker:sabine-pinned-close-20260930, ID sha256:a660745a51ba397edad876e10b8c3486cf6d8bf40c0dbf0fbdc53cec04531339, now runs the owned loopback3106 web container and matches the canonical alias. Prior web retained stopped as swrtracker-sabine-web-before-pinned-close-20260930; earlier rollback containers remain. Reused unchanged DB/JWT/attachment settings; no migration/reset/reseed, request or staffing writes. Health200 and all20,109 request IDs/statuses/row versions retain fingerprint22fcffc03ee306d3b65c8c3eda4997b3. An initial fingerprint command guessed an absent database role; rerun with the configured postgres user succeeded without database changes.
- Deployed acceptance: all eight real scroll checks pass again on3106 without recapturing screenshots. Existing unmocked Sabine navigation at810/390/1902 passes greeting, live/historical destinations, modal backdrop/focus/Home dismissal and per-session logout while another session remains valid. Only test sessions were created/revoked, with no request mutations or page errors. This proves interaction correctness, not frame-rate/load or complete product/security certification.
- Remaining: explicit Manager staffing displayed-state concurrency/idempotency and obligation cleanup, individual Sabine reporting assignments and the complete original KPI/performance audit. The readiness assessment's additive-save semantics must not be silently turned into roster replacement. This checkpoint does not complete the broader autonomous objective or implement exports.
- Production behavior changed: yes, pinned Close controls are deployed to the owned local preview.
- Documentation handoff: independent read-only documenter inspected PRODUCT, DESIGN/sidecar, both source and registered briefs, shared frame/consumers, incumbent global tokens and all eight captures. Disposition ship; existing durable guidance is sufficient, so DESIGN/sidecar remain unchanged. A future shared-popout Components paragraph is optional consolidation, not a blocking omission or authority to regenerate the system. Prior DESIGN130/172 narrative drift remains outside scope. The separate3107 acceptance server was stopped; the user's3106 preview remains running.

### 2026-09-30 — Batch 56 (protected additive staffing command)
- Intent: IMPLEMENTER, Tenancy; owner Decision17 approves stale-state and safe-retry protection on the existing Manager staffing API without changing additive roster semantics. Claimed existing staffing handler/repository/use cases and directly tied tests; no new route, migration or authority tier.
- Files touched: existing staffing handler/application/read/repository; existing staffing unit/read/PostgreSQL dependency fixtures; new staffing-command unit suite, gated staffing-safety PostgreSQL and production HTTP scripts; Decision17, TEAM_MANAGEMENT_INCREMENT and this log.
- Behavior: details and snapshot-only GET return the same opaque tenant/project state checksum. POST requires displayed expectedSnapshot and Idempotency-Key, rejects malformed JSON/unknown fields and canonicalizes selected IDs. Current Manager membership/account/session and editable project status are checked before ledger replay. Selected account/membership locks use stable order; selected Area/coverage rows are held and snapshot comparisons precede validation and writes. Exact replay returns the prior committed response without restoring superseded links. State/session/audit/ledger changes remain one transaction. No fallback for old unprotected input is retained; this is the owner-approved API contract extension.
- Preserved semantics: IM selections add missing links, not a replacement roster; omission does not detach anyone. Another Chief's IM and an already assigned different Chief Area remain rejected. Named teams do not establish reporting/Area authority; historical ticket assignments are untouched. Caller membership rather than global account lock follows the previously tested team-command deadlock-avoidance convention; current session is checked at authorization, not globally serialized against in-flight account revocation.
- Verification: baseline356 tests and TypeScript; final363 tests and nonincremental TypeScript pass. Seven focused command tests cover replay, stale state, pre-replay authorization, payload mismatch, validation, bounded snapshot mode and mutation during eligibility validation. Fresh isolated PostgreSQL migrations001–028 and63 existing team checks,42 staffing-safety checks and23 staffing-read checks pass. Audit-failure injection rolls back roles/session/grants/roster/event/ledger; conflicting writes yield one success/one stale response, identical-key races one event. Actual production HTTP11 protected-save plus10 read scenarios pass against only the disposable fixture. An initial test used an incorrect revocation-table name; corrected to revoked_auth_sessions and recreated only the owned synthetic database for the clean rerun, without weakening assertions. Loopback timings are not production-scale performance evidence.
- Remaining: Manager UI consumer and obligation detach/cleanup are distinct increments; API protection alone does not complete Team Management or the autonomous KPI/performance objective.
- Production behavior changed: yes, owner-approved protected contract; no database schema change.

### 2026-09-30 — Batch 57 (Manager explicit staffing editor)
- Intent: IMPLEMENTER, existing Manager Team Management UI; consume Batch56 safely. Claimed team-management.tsx/CSS and apiClient.ts, preserving incumbent Axiom primitives and organizational-team functionality. Updated PRODUCT and surface contract before/with implementation; no new identity, raster, font, dependency or global design token.
- Behavior: Staffing on current active Party Chief rows opens an inline replacement editor in Full/Medium builds. Current explicit Area/reporting/roster evidence stays separate from proposed Area/Superintendent selections and retained IM additions. Bounded on-demand roster/personnel/Area searches and10/25/50/100 pages never imply completeness; truncated/multiple assigned Areas block this single-Area save. Full requires authorized Superintendent, Medium omits the picker, Slim has no Chief editor. Closed projects are read-only. Confirmed promotions renew affected sessions. Stale rejection disables Save and shows plain reload instructions; deliberate reload clears error/retry key/draft. Unchanged uncertain retries retain their key. Area/Super selection returns keyboard focus to the persistent trigger; Back returns to workspace heading.
- Validation:363 tests and nonincremental TypeScript pass; Windows and Linux production builds pass (retained dependency url.parse and incumbent autoprefixer warnings). Existing team/role production-browser regressions pass at1440/390. Final89 staffing browser assertions at1440/390/810 verify bounded searches after the synthetic population exceeds one page, keyboard Enter/Tab, real Requester-to-IM promotion/session renewal, explicit Area/Super selection, retained roster, same-key retry, actual stale rejection/no event and cleared reload state, closed andFull/Medium/Slim controls. Only lost-response and incomplete-Area fault injections are mocked; all other reads/saves use the exact disposable PostgreSQL safety fixture. Test races/label-prefix/page-one assumptions were fixed in tests, not hidden with weakened product controls.
- Design finish: all eight final current/proposed/stale/closed captures opened and validated in the bounded confirmation. One detector pass reported only retained1.125rem/.875rem typography advisories. Fresh full finish review required stale-recovery and picker-focus corrections; its targeted verdict scored both resolved, disposition ship for this extension only. Independent read-only documenter accepted ordinary-extension persistence and Axiom fit; DESIGN/sidecar remain unchanged. Previously reported DESIGN130/172 narrative drift remains outside scope, not cleared.
- Preview: Linux image swrtracker:sabine-staffing-20260930, IDsha256:9ce35c34d0a62b86e7b3662325c9792fde78ce94120c776fd67711c305151359, runs the owned loopback3106 web and canonical swrtracker:sabine-linux alias. Prior container retained stopped as swrtracker-sabine-web-before-staffing-20260930; earlier rollback containers remain. Same database/JWT/attachment settings; no migration/reset/reseed or Sabine staffing/request mutation. Health200; all20,109 request IDs/statuses/row versions retain fingerprint22fcffc03ee306d3b65c8c3eda4997b3.
- Deployed acceptance: read-only real-Sabine staffing at810/390 verifies current assignments, bounded roster and on-demand personnel without page errors/overflow or staffing/request writes. Existing real live/historical navigation at810/390/1902 passes greeting, stationary account overlay, charts, destinations and per-session logout. Only test login sessions are created/revoked; no screenshot recapture beyond the finish confirmation. These checks prove correctness at the exercised local scenes, not frame-rate/load or complete product/security certification.
- Remaining: targeted roster/reporting/Area detach and protected responsibility/acting-grant cleanup, cross-Area reassignment where appropriate, individual Sabine reporting assignments, original KPI/performance completion audit and lower-priority scoped exports. New removal commands would affect API/permissions and cannot be inferred from Decision17's additive-save approval. See audits/staffing-cleanup-gate-20260930.md. Broader goal remains active, not complete.
- Production behavior changed: yes, narrow protected staffing editor deployed to the owned local preview.
- Runtime cleanup: stopped the owned3107 acceptance server and removed only the ID/label/port-verified synthetic staffing-test container and disposable volume. Its data can be recreated with the gated fixture scripts; Sabine, attachments and all retained rollback containers remain untouched.
- Provenance follow-up: Impeccable's required read-only raster scan found the two pre-existing Axiom PNGs lacked embedded origins. Added only documented owner-source PNG text metadata and clarified public/brand/README. All non-text PNG chunks compare byte-identical with the supplied originals, including dimensions/image/color/alpha; neither asset is generated or visually changed. The follow-up scan is clean. This supersedes the earlier no-brand-file-diff statement, not the retained visual identity or DESIGN/sidecar verdict.
- Independent documenter recheck accepted the origin tags/README and independently verified byte-identical non-text chunks. Refreshed Linux image/alias is now IDsha256:aa935456db04adc170c448338f6221e393e1fad51940020b3c6a43ee364c89f2, superseding the earlier image ID only for identical-pixel provenance. Prior UI web retained as swrtracker-sabine-web-before-staffing-provenance-20260930, alongside the pre-increment rollback. No data/settings changes.

### 2026-09-30 — Batch 58 (Manager exact-link staffing cleanup)
- Intent: IMPLEMENTER, Tenancy plus the existing staffing resource/client/editor. Owner Decision18 approves only targeted soft-deactivation, not a bulk obligation reset or permission builder. Existing four-role model, additive save, named teams and protected grants remain intact.
- Files touched: new unlink-survey-staffing application use case; existing staffing repository/read/handler/route/client and Team Management editor; focused command/unit/read fixtures and gated unlink PostgreSQL/browser tests; Decision18, CLAUDE audit payload, PRODUCT/surface contract, Team Management/KPI progress, cleanup gate and this log. No migration, dependency, global CSS/token/font/identity-raster edit.
- Contract: PATCH existing staffing with action unlink, fixed kind roster/reporting/area, exact scoped linkId, partyChiefId, expectedSnapshot, confirmUnlink true and Idempotency-Key. Current Manager authority/session/editable status precedes cached replay. Lock selected subject/current row, compare snapshot before validation and writes; atomically soft-deactivate only the selected link, record previous-link evidence and ledger. Refuse dependent reporting before individual Area removal. Department/responsibility/acting grants, roles/accounts/project memberships/named teams and all ticket assignments/history remain unchanged. Separate guarded role removal retains Requester; unlink does not demote.
- Read/UI: roster rows expose exact link identity; Area nodes expose eligible individual identity only when unambiguous. Bounded/truncated evidence never becomes a complete replacement selection. Named Unlink buttons lead to one inline confirmation; Keep returns focus, success reloads the same Chief and announces preserved records. Busy, failed reads, stale state and closed projects block/hide mutations. Stale evidence stays latched across cancellation/selection resets until deliberate reload.
- Verification: baseline363 tests/nonincremental TypeScript; final367 tests/nonincremental TypeScript pass. Windows and Linux production builds pass, retaining incumbent autoprefixer and dependency url.parse warnings. Fresh isolated PostgreSQL migrations001–028 and63 existing teams,42 additive staffing safety,35 unlink,23 staffing read checks pass (163 total). New unlink cases include exact tenant/project/Chief fences, protected department grants, dependent reporting, retired scope, duplicate individual evidence, audit/ledger rollback, identical/distinct-key races, replay after later relink, authority/session/status recheck, and separate demotion preserving full ticket rows. Initial fixture assumptions about absent ticket leadership columns/AOR XOR were corrected against actual schema before the clean rerun; no product validation was weakened.
- Actual HTTP/browser: existing11 protected-save/10 read HTTP checks pass. New57 real-stack unlink browser checks at1440/390/810 cover confirmation/keyboard, dependency refusal, one-row soft-deactivation, real committed response-loss retry with unchanged key/body, actual concurrent stale refusal→Keep→retained warning/disabled writes→reload→success, exactly3 unlink events and closed controls. Only response delivery is synthetic after a real commit; all other unlink reads/writes use the exact disposable PostgreSQL fixture. Existing89 staffing assertions and named-team/role1440/390 regressions pass. The existing roster search test now awaits its actual response before counting current rows, resolving a React loading race without weakening assertions.
- Design: one detector pass[]; all eight original captures and the added390 stale-after-cancel capture opened/validated in the bounded confirmation. Fresh full Impeccable finish review found one stale-cancellation reset defect; its targeted verdict scored that issue resolved, disposition ship at that scope. Fresh read-only documenter inspected PRODUCT/contract, DESIGN/sidecar, shared primitives/global tokens and all nine captures; documentary ship, no missing durable guidance or new tokens. DESIGN/sidecar preserved; pre-existing DESIGN130/172 narrative drift remains reported, not repaired. Shipping raster provenance scan public/brand:2 rasters/0 missing, no asset changes.
- Preview: verified Linux image swrtracker:sabine-unlink-20260930, IDsha256:2bbcbb0e12d87c57ad56f3205b8c47e692156e9d31e28e20f45da38f60d14385, now runs owned loopback3106 and canonical swrtracker:sabine-linux. Prior web retained stopped as swrtracker-sabine-web-before-unlink-20260930; all earlier rollback containers remain. Database/JWT/attachment settings unchanged; no migration/reset/reseed or Sabine staffing/request writes. Health200, all20,109 request IDs/statuses/row versions retain fingerprint22fcffc03ee306d3b65c8c3eda4997b3.
- Deployed acceptance: read-only real-Sabine staffing810/390, live/historical navigation810/390/1902 and eight pinned-close scroll cases1440/390 pass with no page errors/overflow or staffing/request mutations. Only test login sessions were created/revoked. No extra polish captures. These are local correctness/interaction checks, not a load/frame-rate or whole-product/security certification.
- Org charts: all three one-page owner PDFs were text-extracted, rendered and visually inspected; exclude CAD-Technician. Lead Superintendent/Lead Chief, Surveyor and support layers vary by chart; no real names/accounts/reporting links imported. Owner clarifies assistants without email do not need authorization or the request log. Support headcount is distinct from app users. Additional reporting-tier interpretation requires a separate decision; no title automatically grants authority.
- Remaining: protected responsibility/acting/department administration, appropriate cross-Area reassignment, individual Sabine relationship mapping, complete original KPI/performance audit and lower-priority scoped exports. Target unlink closes its approval gate only. Broader objective is not complete. Checkpoint this coherent increment before a read-only completion-evidence audit.
- Production behavior changed: yes, approved exact-link cleanup and its UI are deployed to the owned local preview; no real staffing was changed in acceptance.
- Runtime cleanup: stopped owned acceptance3107; removed only the verified synthetic unlink container/volume and three exact PDF render scratch PNGs. Synthetic data is reproducible with gated fixtures; original PDFs, Sabine/database/attachments and rollback containers remain intact. Remote phase5 was aligned0/0 before checkpointing; no merge or force push is used.

### 2026-09-30 — Batch 59 (completion-evidence audit)
- Intent: AUDITOR, read-only source/acceptance assessment after implementation checkpointd046cd6 was committed/pushed and remote hash verified; no production source, permission, schema, identity or workflow edits.
- Output: audits/phase5-completion-evidence-20260930.md maps original refresh/KPI, Command dashboard, staffing, navigation and chart requirements to current evidence versus deferral/decision boundaries. Older unchecked progress lists are historical, not the current matrix. Re-read owner's red-team brief and recorded Batch47 remediation/deployment caveats without claiming a new vulnerability validation.
- Fresh checks: web-perf skill discovered no trace/insight MCP tools; continued source/network/PerformanceObserver analysis. Read-only pool lifecycle12 idle-expiry cycles pass. Eight cold/warm1440/390 load samples across Manager overview/historical review: zero initial ticket calls, no errors/overflow/observed long tasks, one project-list call. Live4 API calls/30,716 decoded bytes; history3/19,986. Last API180.3–356.7ms, observed LCP32–104ms, unthrottled loopback only. Different surfaces/date semantics prevent a controlled before/after ratio; no INP/hydration/CWV field or production load certification.
- Current real-preview metrics167 checks pass across six accounts; historical chart12,198 decoded bytes/117ms,14,506 cycle samples. Qualified session-local pg_temp SQL fixture49 scenarios passes and rolls back; no public data writes. Final20,109 request fingerprint remains22fcffc03ee306d3b65c8c3eda4997b3. Test-only performance login revoked; credentials remain private.
- Remaining boundary: owner assistant/CAD rule is settled; Lead title display-only versus explicit additional reporting tiers is unresolved. Recommend display-only without inferred authority. Protected grants, individual Sabine mapping, low-priority exports and representative query-plan/load/interaction/deployment acceptance remain separate. This report does not mark overall development complete or authorize new accounts/roles.
- Production behavior changed: no. Impeccable files/source/captures are unchanged from reviewed Batch58; no new UI handoff is necessary for a read-only report.

### 2026-09-30 — Batch 60 (display-only org-chart decision)
- Intent: record the owner's structured answer as Decision19, resolving the chart-title gate without introducing new authority tiers. Documentation-only; no production source, API, schema, UI, priority, permission, account or simulation-record changes.
- Files touched: PRODUCT, Decision log, Team Management increment, KPI progress, completion-evidence audit follow-up and this append-only log. Lead titles/Surveyor/Assistant levels remain organizational labels within existing fixed survey roles; explicit Area/reporting permissions remain authoritative. Assistants without email stay outside the assumed app-user population; CAD exclusion concerns supplied examples, not deletion of existing functionality. A new editable title contract or priority-bearing department-title reuse is not inferred.
- Verification: unchanged baseline nonincremental TypeScript and367/367 tests pass. Documentation diff/check plus final type/test confirmation follow; the existing reviewed preview/image remains unchanged, so no rebuild, new raster, detector or UI polish/handoff is required.
- Remaining: safe query-plan/load/interaction acceptance, protected-grant administration, individual Sabine relationships and lower-priority scoped exports. Chart-tier decision is no longer pending; overall product/deployment completion is not claimed.
- Production behavior changed: no.

### 2026-09-30 — Batch 61 (read-only dashboard query-cost follow-up)
- Intent: AUDITOR, measured follow-up under the standing development objective after Decision19. No production source/test/schema/permission or preview-image changes. Output: audits/dashboard-query-cost-20260930.md and completion-evidence follow-up; this required log append is the documentary exception to the audit-only write boundary.
- Fresh evidence:27 EXPLAIN ANALYZE/BUFFERS samples over nine current queries with actual Manager/live and Viewer/history server-resolved scope. All transactions READ ONLY with10s timeout. Live all/open chart median252.293/212.830ms with84/70 repeated scans of20,025 import events; history open120.499ms with33 scans. Other measured cases and existing temporary-disk work are in the report. No uncontrolled cache reset, concurrency flood or planner setting changes.
- Read-only experiments: full-payload materialization improved two live cases but introduced temp writes; historical raw equality stopped its pilot, cause not established. Projected/aggregated provenance passed raw and canonical JSON equality for six cases and18 plan samples; live all27.611ms and history open52.979ms, but Area selections regress and temporary blocks increase. Neither candidate shipped; no blanket optimization claim or new infrastructure/index proposal. Next safe work is a bounded Reporting query-shape investigation with full scope/provenance regression coverage.
- Verification: final nonincremental TypeScript and367/367 tests pass, confirming Batch60. Documentation diff check passes. All20,109 requests retain fingerprint22fcffc03ee306d3b65c8c3eda4997b3; no records/accounts/staffing were written. Existing reviewed Linux preview remains unchanged; no new UI/design handoff is required. Remaining load/interaction/deployment and protected-grant/mapping/export scope persists. Overall objective is not marked complete.
- Production behavior changed: no. Checkpoint Decision19 plus this coherent read-only evidence on current phase5; no merge/force push.

### 2026-09-30 — Batch 62 (scoped provenance query performance fix)
- Intent: IMPLEMENTER, Reporting infrastructure and its tests; preserve existing authority/API/result semantics. Inspected fresh branch/state/instructions and baseline367 tests/nonincremental TypeScript. The measured nested-loop event scan, not new infrastructure, is the next existing-scope defect.
- Files: amelia-metrics.reader, focused unit regression, scoped-metrics-postgres extension, new guarded metrics-provenance-plan fixture; query-cost evidence, KPI progress, Decision20 and this log. No schema/index/dependency/global CSS/raster/token/UI edits. Query uses tenant/ticket membership in the already-filtered CTE with IS TRUE to retain a hashed SubPlan; original bool_or/generated exclusion remains. Broad tenant payload materialization and plain semi-join experiments were rejected; compact materialization pilot did not finish its historical comparison, no claim of validation.
- Validation: final368 unit tests and nonincremental TypeScript pass. PostgreSQL52 scope/provenance cases use only qualified pg_temp writes and rollback. Forty real five-account live/history content comparisons plus four50,000-request/105,000-event UUID temp comparisons pass, including linked42 and own25,000 cycle coverage. Thirty alternating-order paired plan samples use zero/one hashed event scans; live all276.591→5.903ms, live open214.075→5.264ms, history open126.015→24.633ms; history all119.286→119.020ms. Synthetic-all384.514→392.215ms(~2% slower) and unchanged existing temp costs are disclosed, not suppressed by a timing threshold. Small local results are not a production/planner guarantee.
- Builds/deployment: Windows and Linux production builds pass, retaining incumbent autoprefixer/dependency warnings. Verified image swrtracker:sabine-provenance-20260930, IDsha256:a83abb8137701425bfba101f7765690d29a68960b16603c559fae97f5d1fcbe0, runs owned loopback3106 and canonical alias. Prior container retained stopped as swrtracker-sabine-web-before-provenance-20260930. Environment/attachment mount/network/port/ownership/image checks precede cutover; app settings remain identical. No migration/reset/reseed or Sabine staffing/request writes.
- Deployed acceptance:167 actual six-account HTTP cases pass; navigation810/390/1902 and eight pinned-close1440/390 cases pass. Health200. A bounded warm24 mixed-read concurrency8 check passes, per-endpoint ranges/medians recorded in audit; own test login revoked and reuse401. All20,109 public request IDs/statuses/row versions retain fingerprint22fcffc03ee306d3b65c8c3eda4997b3. No new screenshots/UI changes, so no new design finish handoff; original reviewed UI preserved.
- Remaining: full deployment/soak/physical-device/INP acceptance, cross-Area staffing, individual Sabine links and scoped exports. Owner Decision20 now approves a narrow IT-admin-only protected-grant resolution flow; Manager blockers/handoff only. It is not implemented in this checkpoint. Continue by inspecting existing grant/coverage contracts, not granting Manager cleanup or inventing hierarchy/account powers. Overall objective is not complete.
- Production behavior changed: query execution cost only; existing metrics/data/permissions remain unchanged. Checkpoint this coherent verified increment before the next authorized feature.

### 2026-09-30 — Batch 63 (protected-grant contract assessment)
- Intent: read-only Tenancy assessment under approved Decision20 after committed/pushed phase5 checkpoint aaed8df. Documentary output: audits/protected-grant-resolution-contract-20260930.md and this append. No production/UI/API/schema/runtime/settings or real staffing writes.
- Evidence: central/project IT scope is already represented by access-administrator. Responsibility revocation has retained rows and a restricted access audit action; acting scope is arbitrary JSON without an implemented workflow authority resolver. FIELD_COORDINATOR has no runtime consumer. Area assignment user/department XOR means shared department grants are not individual roleObligations; department membership is distinct and not currently counted by that guard. Existing audit contracts cannot retain replacement coverage evidence without an additive change.
- Next gate: confirm existing-authorized replacement versus authority creation, individual department-membership semantics versus shared department grants, and the explicit project command/additive audit contract. Decision20's IT-only boundary remains accepted, not reopened. Unsupported scopes must remain blocked rather than guessed. No removal controls were implemented or deployed by this assessment; whole objective remains active and unfinished.
- Validation: source/schema/spec cross-check and documentation diff check only; no source change, so Batch62's368 tests and production builds are the latest implementation baseline, not a claim of tests for this new flow. No new UI edit or design completion claim.
- Production behavior changed: no. Preserve the verified preview/checkpoint and stop at the owner's contract decision before implementation.

### 2026-09-30 — Batch 64 (assessment authorization and durable-file remediation)
- Intent: IMPLEMENTER, address the four confirmed findings in the owner's phase5-da855c0 assessment brief against current phase5 aaed8df. The separate user-dirty D: Phase5-RedTeam checkout and completed assessment scan remain untouched. Sequenced boundaries: Ticket authorization first; Attachment route/input and Docker/Compose persistence next; Notification projection last under the owner's explicit delivery-health-only IT decision. Shared exceptions: ticket-route-helpers, ticket-visibility-clause, resource-uuid, list query/route, notification response contract, deployment docs and this append. No simultaneous source writers, new schema, dependencies or authority roles.
- FILE-001: require active tenant/project crew links in the resolver and again in shared query SQL; retain exact Instrument Man assignment reads. Existing audited staffing unlink support on current phase5 is retained. AUTH-001: lock/recheck active leadership, project, selected Area ancestry and individual authority inside creation transaction before numbering/persistence and cached response replay. Manager project-wide and Superintendent descendant scope remain. REQ-001: exact Instrument Man field-cancel assignment on the transition's same read, preserving stale-state/audit behavior. AUTH-002: normalize absent membership and enforce shared resource visibility before command role/state checks; readable-role denials stay403, hidden and missing return404, auth stays401. The fresh reviewer reproduced a surviving PATCH oracle in the first patch; final scoped preflight fixes it.
- Owner decision21 (this assessment): IT sees delivery health only. Tenant/Project Admin SQL and response mapping omit request IDs/numbers/payload/reasons/urgency and replace arbitrary transport-error text with safe failure guidance. Recipient/event/delivery state remain; operational recipient/Manager content and existing capture/retry authority are unchanged. Redacted notification ticketId is nullable in the shared response contract. UUID validation now intentionally rejects malformed ticket/file/list-project IDs and repeated projectId selectors; this is not exhaustive validation of every API body/endpoint.
- Durable files: image and generic Compose web agree on SWR_ATTACHMENT_ROOT=/var/lib/swr/attachments and a private named volume. Deployment guidance records existing-root migration, coordinated DB/file backup and restore, stable volume identity and no inferred deletion/cleanup. Two separate network-disabled non-root containers verify one synthetic stored file's bytes/hash survive replacement, UID1000/root0700/file0600. Only the labeled swrtracker-assessment-persistence-20260930 test volume is written and retained; Sabine files are untouched.
- Verification: baseline368 unit/nonincremental TypeScript pass; final376 unit/nonincremental TypeScript and Windows/Linux production builds pass. New rollback-only PostgreSQL actual-handler/repository matrix53 assertions and scoped metrics55 scenarios pass, including current/revoked/foreign crew, direct-assignee controls, exact cancellation, unauthorized creation before writes, descendant coverage, post-revocation replay, same-project invisible PATCH, malformed IDs and real IT-redaction SQL. Independent prepatch investigator and one fresh read-only bypass review completed; no additional concrete bypass reported. Later notification/config changes are primary-reviewed/regression-tested, not a new security scan.
- Deployed acceptance:167 existing metrics HTTP checks and1555 new current-record HTTP access checks pass across six accounts,84 live request IDs, detail/history/file metadata, historical read-only, IT redaction and revoked matrix test logins. Request fingerprint unchanged. Old seed-only scripts/verify-sabine.mjs fails before HTTP at8 versus original14 SUBMITTED; its seed assertion is not weakened and data is not reset. New tests/beta/sabine-request-access-http.mjs checks current independent scope/identity instead. Synthetic PG writes roll back and public records remain unchanged.
- Preview: owned loopback3106 runs swrtracker:sabine-assessment-20260930, verified image sha256:126e3e1675d9ae7fd03f0caa85386d58902b9cfef3cd1574c60890b57f5770f5, health200, preserving exact private settings/network/attachment mount. Incumbent retained stopped as swrtracker-sabine-web-before-assessment-20260930. No migration/reset/reseed/merge or real request/staffing/file mutation. No UI edit/design completion claim; existing UI remains.
- Remaining brief: requester partial-submission/Save Draft, correction Area/Type and dirty-resubmit, calendar-date/history, retained failed files and recovery copy; central IT/account/member/invite lifecycle and consolidated permissions/investigation. Protected-grant replacement questions remain separately gated. Actual multi-session revocation/lock interleavings, production host ACL/static proxy, coordinated backup restore, soak/devices/assistive technology and complete interruption recovery are unverified. Delete/move/orphan cleanup requires explicit retention semantics. This is a remediation checkpoint, not closure of the whole assessment or production approval; overall goal stays active.
- Retained derived security record: plugin-managed standalone artifacts/assessment-remediation-20260930.md for this worktree; original canonical assessment artifacts are immutable. Checkpoint this verified increment on current phase5 before continuing the remaining backlog.
- Production behavior changed: yes, authorization enforcement, deliberate input errors, approved IT support-data minimization and generic container attachment durability.

### 2026-09-30 — Batch 65 (approved partial drafts and recoverable deletion)
- Intent: IMPLEMENTER, owner Decisions22/23 approve both outstanding requester gates. Sequence Ticket lifecycle/schema first, Attachment retry handling next, requester/recovery UI last. Shared exceptions: scoped API routes/client/contracts, visibility and review-authority predicates, audit event types, calendar/input/retry/navigation helpers, nullable-date display consumers, focused tests and project documents. No parallel source writers, new authority roles/dependencies, Manager recovery powers, automatic expiry or permanent purge. The separate user-dirty D: Phase5-RedTeam checkout remains untouched.
- Partial intake: migration029 permits null Area/Type/Need-By only in DRAFT, adds save/deletion metadata and constrains submitted intake and deletion consistency. Explicit project-scoped Save Draft creates one durable unnumbered request; subsequent save/resume/retry uses that ID. Supplied values retain type/calendar/active-Area validation. Submit checks Area, Type, contact, date and details before allocating a public number; approved R03 optional-department behavior is honored, with supplied department validation retained. First submission/public identity, return cycles, existing priority/lead-time rules and direct-assignment completeness remain.
- Recovery: requester soft-deletes only an owned DRAFT with expected version. Shared normal visibility hides deleted request/history/file metadata. Project-scoped current PROJECT_ADMIN alone lists/restores deleted drafts, with explicit confirmation, minimum10-character reason, 30-day window and active Requester owner. Archive/stale/wrong-scope denials and current identity/company/membership checks precede command replay. Restore retains original ID, files and append-only history. Expired rows/files remain retained; no expiry job, hard delete, orphan sweep or retention policy is inferred.
- Atomicity: draft save/delete/recovery audit events are in the command transaction. Current authority/share locks and ticket update locks fence state changes. Stable idempotency keys and frozen client commands retain uncertain writes; stale versions require deliberate reload. Legacy callers can omit new save/submit versions, and their previous submit request hash remains compatible. New draft/deletion/restore commands require their explicit version/key contracts.
- Files: requester selection survives failed uploads. Keyed upload commands fingerprint original name/MIME/size/purpose/content hash and recheck current resource authority before replay. Metadata/audit/replay entries are atomic; replay discards only the newly staged duplicate object, not the original saved file. Existing no-key upload compatibility is retained. Upload locks serialize with submit/delete, and failed/uncertain file staging is not cleared or counted as saved. No file purge or real Sabine upload occurred in verification.
- UI: existing six-step wizard exposes Save Draft throughout, supports incomplete steps and same-record resume, distinguishes saved/staged files and retains failed input. Correction adds Area/Type and blocks dirty resubmission until save. Draft list is bounded/paged with resume/details/delete; admin recovery is on-demand/paged with reason/confirmation and expired-retention copy. Local dirty/unconfirmed fields warn on reload and intercepted app links; this is not a blanket SPA-history/back-navigation guarantee or autosave. Need-By uses UTC calendar-day display; PostgreSQL DATE reads/writes are day strings, avoiding the observed Windows previous-day conversion. History exposes before/after Need-By and reasons without rewriting stored history.
- Verification: clean baseline376 unit/nonincremental TypeScript; final388 unit/nonincremental TypeScript pass. Windows and Linux production builds pass, retaining incumbent CSS/dependency warnings. Final rollback-only PostgreSQL draft matrix78 assertions includes migration replay twice over all20,109 copied incumbent rows with full field checksum unchanged, new-column statistics, actual routes/repositories, no premature numbering, current/stale/expired/archive/owner/scope denials, hidden cached save after delete, stable file replay/payload mismatch cleanup, retained restored file, submit leap-day/DB constraints and audit-failure rollback. Existing authorization53 and scoped metrics55 PostgreSQL checks pass. Synthetic writes remain in verified pg_temp and roll back.
- Browser: database-free interception acceptance passes wizard/detail/list/recovery at1440/810/390, including lost-response exact-key create/save/upload retry, one record, dirty navigation cancellation, disabled unsaved resubmit, retained failed selection and recovery validation/confirmation. Fifteen final captures plus incumbent810/390 were inspected in bounded initial/fix/confirmation passes; no additional polish loop. One misleading saved-file count and Area/copy/calendar-policy alignment were fixed together. Detector ran once across nine changed targets with no findings. No new raster, token/font/global CSS or identity change.
- Impeccable: registered requester surface direction contract records that its initial pre-code documentation step was missed and corrected after first edits, without a retroactive compliance claim. Fresh read-only finish reviewer disposition ship; fresh read-only documenter confirms ordinary Axiom extension and preserves DESIGN.md/.impeccable/design.json. Reported documentary differences, not repaired: reversible Delete Draft uses an existing secondary button while DESIGN describes danger fill for destructive actions; preexisting greeting/drawer slide/pinned-header behavior is incompletely covered by DESIGN/sidecar. These handoffs certify this extension only, not whole-product accessibility/security/performance.
- Preview/backup: owned loopback3106 runs swrtracker:sabine-drafts-20260930, IDsha256:7f8b5b80b8219033b898385f32ff402f1631e7c8c87482aa9e2bde89c1ecd99d, health200; canonical sabine-linux points to it. Exact private environment, non-root user, network, port and attachment volume are preserved. Coordinated quiesced pre-migration database.dump/attachments.tar are retained privately under .data/sabine/backups/drafts-20260930. Full database restore succeeded in an isolated unexposed PostgreSQL container; attachment archive is readable, not a claim of restoring it into the live volume. Prior web is retained stopped as swrtracker-sabine-web-before-drafts-20260930, alongside earlier rollback containers. Full incumbent ticket fields matched the restored backup before/after cutover; no reseed/reset or request/staffing/file content mutation.
- Cutover correction: first attempt captured backups/applied029 but failed to launch Docker because inherited Linux PATH replaced Windows command lookup. Old preview was restarted automatically, preserving records/schema/backups. Explicit Docker executable resolution plus gated resume verified the original backup rather than overwriting it. The one-shot helper now separates create/start so a start failure retains the created container and restores the prior web. This is owned local preview recovery, not production rollback certification.
- Planner follow-up: deployed browser acceptance exposed missing statistics for new draft_deleted_at: history population estimated100 instead of20,025, selecting a nested-loop provenance join and exceeding30s. Added scoped ANALYZE tickets(draft_deleted_at) to029 and applied that statistics-only step to the already migrated preview. Estimate is now20,025 with a hash provenance join; no query results, request rows or visibility rule changed. Web-perf found no trace tools; source/network/EXPLAIN diagnosis only, not Core Web Vitals certification. PostgreSQL15 ANALYZE semantics checked against official documentation. No longer timeout was substituted for the regression.
- Deployed acceptance:1555 current-record access checks and167 metrics checks pass. Historical/live navigation at810/390/1902 and all eight frozen-close scroll cases1440/390 pass without errors or real request mutations. Navigation test now explicitly awaits Home's project-entry hop then operations redirect, fixing its previously matching-final-URL race before reopening/signing out; no production menu source or assertion was weakened. All20,109 public request IDs/statuses/versions retain fingerprint22fcffc03ee306d3b65c8c3eda4997b3. Original seed-only8-versus14 SUBMITTED check remains unaltered, not used as current-record acceptance.
- Remaining: central IT discovery/account/company/member/invitation lifecycle and consolidated permissions/investigation, protected-grant replacement/department/additive-audit contract decisions, individual Sabine mapping, low-priority scoped exports, and representative production ACL/proxy/restore/soak/device/assistive-technology/interruption acceptance. Automatic expiry and permanent draft/attachment purge stay explicitly deferred. This coherent checkpoint addresses requester gates, not closure of every assessment finding or the overall objective.
- Production behavior changed: yes, approved requester partial intake, corrections, recoverable soft-delete/project-admin restore, durable retries and calendar-date handling, deployed only to the owned local preview. Checkpoint/push current phase5 without merging or force-pushing before delivering the requested five-role demo access.
- Handoff: independently authenticated admin/manager/super1/chief1/im1.1 demo accounts, verified their live-project fixed roles and project-list access, and checked Project Admin recovery-list access. Revoked these verification sessions; no credentials are committed. Private runtime/demo files and review captures remain ignored. Stopped the exact image/loopback3107-verified synthetic UI review container and retained it, the isolated restored DB and all backups/rollback containers. Removed only the three owned diagnostic helpers; they are reproducible and contain no saved credentials. GitHub phase5 was aligned0/0 at the pre-commit check; D: checkout untouched.

### 2026-10-01 — Batch 66 (approved assigned workforce, project creation and shared controls)
- Role/scope: IMPLEMENTER on existing clean phase5 verification worktree at79bf563; owner approved the pasted increment and bounded design. Original D: Phase5-RedTeam checkout and its preexisting changes remain untouched. Cross-module work is sequential; one read-only reviewer, no parallel production writers.
- Creation/navigation: reused existing createProject contract through injectable existing POST handler. TENANT_ADMIN launcher exposes name/crew build/template, newest100 tenant projects, Setup success and existing configuration link. No automatic activation or operator role. Account navigation uses current server-derived project role; Manager/SP/PC get Team Management, and direct routes independently enforce authority.
- Pool decision: current explicit Manager-assigned SP→PC reporting links intersected with active Area coverage, plus current PC→IM rosters, represent the authorized workforce without a new schema or inferred organization authority. SP transfers only a current assigned IM between current assigned Chiefs; PC is read-only. Current role/session/active identity/tenant/project/archive checks, project/membership locks, snapshot/reload and keyed atomic audit/replay preserve bounds and history.
- KPIs: reused explorer/reader/provenance/cycle definitions. Mandatory member focus constrains authorized CTE, facets and denominator; SP uses linked crews and current field IM/Chief pairing. Manager inspecting SP uses current linked/Area population. Member views suppress wider personnel dimensions and matching-request expansion; no organizational team or Area overlap grants personnel authority.
- UI: bounded assigned lists/pickers, pending/error/retry and frozen uncertain commands; scoped native KPI dialog/focus return. Reusable actual-overflow arrows cover page/container/nested dialogs, reduced motion and keyboard. Popouts reserve footer space and preserve frozen Close. Central button/navigation radius0 preserves input/banner/badge/card/dialog rounding.
- Verification: baseline388 tests/TypeScript/build pass; final397 tests/TypeScript and production Docker build pass. PostgreSQL420 checks: teams63, SP KPI20, safety42, unlink35, new actual workforce routes74, recent security53, scoped metrics55, draft recovery78. New synthetic PG15 loopback15489 only; existing security/metrics/draft checks use verified rollback-only pg_temp with public data preserved. No Sabine mutation or cutover.
- Browser/review:96 real-session production-image checks at1440/390 for all four requested roles plus denied Requester/IM, including creation/configuration/Setup, SP transfer, fixed member focus, direct URL, page/container/nested keyboard arrows, reserved space and frozen Close. Final captures inspected. Read-only reviewer found nested-dialog and rounded portal/nav issues, corrected and regression verified; follow-up no blocker. Incumbent CSS/cache/deprecation warnings retained.
- Handoff: docs/PHASE5_TEAM_WORKFORCE_INCREMENT.md records all files, authority, checks, reproduction and limits; PRODUCT.md/DESIGN.md reflect approved population/geometry. Test logs/screenshots ignored and excluded from Docker context. Production behavior changed: yes, approved increment; existing Sabine preview unchanged. No migration/dependency/new role, invitations, generalized SP team mutation or hosted-beta/overall Phase5 completion claim. Commit this verified increment on phase5; no push/merge/deployment requested.


### 2026-10-01 — Batch 67 (approved workforce concurrency and stale-editor repair)
- Role/scope: IMPLEMENTER, bounded Tenancy transfer and its existing UI/API consumer; owner explicitly approved the two reproduced repairs. Reused clean existing `phase5` verification worktree. Read-only archaeology found local608e984 one ahead/zero behind fetched origin79bf563; original dirty D: Phase5-RedTeam work and retained Sabine remain untouched. No reset/merge/force-push or parallel source writer.
- Design basis: reread PRODUCT/DESIGN, repository instructions, ADCQ requirements, current owner log/Team Management, completion/protected-grant audits, later CODEX batches and approved workforce contract against source/migrations/tests. Prior completed staffing/KPI/requester/security work is retained. Decision20 grants only IT authority, not unspecified coverage/department/audit semantics; those gates remain open. Broader IT lifecycle, real Sabine mapping, export and deployment acceptance remain separately scoped; expiry/hard deletion/purge/general RBAC/title-derived authority stay deferred.
- Baseline: current608e984 nonincremental TypeScript,397 tests and native Windows build pass; fresh disposable PG234 checks and native production browser96 checks pass. Review then dynamically reproduced grant revocation winning between final snapshot and roster write, and a stale displayed Chief receiving a fresh token and overwriting an intervening assignment (200). Baseline success alone did not prove these missing cases.
- Repair: hold current Area nodes/actor grants/reporting/current roster through transfer/audit/ledger commit. Single SQL statement returns bounded workforce rows/count/displayed snapshot; editor uses that page token instead of fetching a fresh token over stale evidence. Existing deliberate reload/409/disabled-save/uncertain-key semantics and all authority/population/history bounds retained. Exported incumbent snapshot CTE avoids duplicating its checksum contract; no new route/migration/dependency/role.
- TDD/debugging: actual two-session grant regression fails before scope locks; actual page contract fails before snapshot binding; authenticated stale-editor regression fails200 vs409 before UI fix. Independent review identified new project/grant lock-order inversion during existing SETUP grant replacement. Added replacement-first actual-repository test, reproduced PostgreSQL40P01, then narrowed only workforce project lock to FOR NO KEY UPDATE (still conflicts with project writes, allows FK KEY SHARE). Final30 repair checks pass; no speculative architecture or expanded generic Area-writer authority.
- Fresh final verification: nonincremental TypeScript,397 tests(0 failures), Windows production build and Linux Node22 Docker production build pass. Newly created labeled disposable PG15 applies001–029 and passes264 checks: teams63/SP20/safety42/unlink35/workforce74/repair30. Final owned native production preview passes96 existing +27 new real-session browser checks at1440/390, including stale refusal/no mutation or extra audit and explicit reload/success. Existing browser console wording says production image; actual current runtime is native production. Earlier420 evidence is historical, not claimed as freshly rerun. Incumbent URL deprecation warnings persist.
- Review/design finish: independent read-only review's Important deadlock finding reproduced/fixed; follow-up no remaining material bounded finding. Executor ran all verification. Batched desktop/mobile stale captures inspected; retained Axiom geometry/copy/focus/error controls, no new visual guidance or DESIGN changes. One mechanical detector pass returned[]. Wider load, physical-device, assistive-technology, lifecycle/account-race and hosted-beta acceptance not certified.
- Handoff: PHASE5_TEAM_WORKFORCE_INCREMENT follow-up records corrected contracts, actual verification runtime/counts, reproductions and limits. Stop/retain only identity-verified owned3107 server and labeled synthetic15489 PG; private runtime/logs/captures remain ignored. No Sabine mutation, migration, reseed, relationship invention, attachment purge, backup replacement or cutover. Production behavior changed: yes, approved bounded repair. Commit and ordinarily push608e984 plus this verified repair to origin/phase5 under current continuation authorization, then verify remote landing before reporting checkpoint. Overall Phase5 remains open at owner-contract gates.


### 2026-10-01 - Batch 68 (responsibility-only resolution design checkpoint)
- Role/scope: design authority for the next Decision20 first slice. Owner's "Continue" accepts the recommended SURVEY_REVIEWER-only scope and same-Area already-authorized replacement/atomic retained evidence; architectural written-spec and later plan reviews remain required. No product implementation skill, source/API/test/migration change or parallel writer.
- State: clean phase5 linked verification worktree atfb45827, fetched origin/phase5 alsofb45827,0/0. Original D: dirty Phase5-RedTeam checkout atd8fe20e and its changes preserved. Current approved staffing/workforce/KPI/requester/security work retained rather than repeated.
- Fresh baseline: pnpm tsc --noEmit --incremental false,397 tests(0 failed) and native Windows production build pass at unchanged source. Previous Linux/database/browser evidence belongs to Batch67 and is not claimed as rerun here. No synthetic or retained database is mutated for this documentation work.
- Design evidence: existing responsibility schema/review helper, individual Area visibility/request context, IT administration boundary, role obligations, idempotency, generic Area writers, project Admin/Manager role UI and current audit/decision sources inspected. Responsibility grants without request visibility do not establish executable review coverage. Proposed exact-Area grant plus individual assignment, supported active subject/top-level Area, nullable access_grant_events evidence, current-authority-before-replay, retained history, stable lock ordering and actual race/rollback/browser tests are specified for review. Acting/FIELD_COORDINATOR/department resolution and new membership blockers remain gated; no generalized lifecycle/permissions/exports or Sabine assignments added.
- Files: new docs/superpowers/specs/2026-10-01-survey-reviewer-resolution-design.md; Decision24 scope provenance; protected-contract audit follow-up; this entry. Corrected only invalid encoding in our prior Batch67/workforce continuation append, preserving their text and all earlier bytes.
- Review/handoff: specification self-review checks scope, coverage, replay/lock consistency and placeholders; independent read-only design review before owner handoff. Commit/push this reviewable documentation checkpoint under current continuous-work authorization, verify remote landing, then stop at written-spec approval. Writing-plans is the next skill after approval; no nonexistent plan is treated as approved. Production behavior changed: no. Sabine containers/data/attachments/backups/relationships and earlier runtime remain untouched.

- Independent review result: no Critical/Important design finding; suitable for owner review, not implementation certification. Clarified historical-identity-only pre-ledger locks vs fresh live eligibility, central IT's existing launcher/direct entry without project navigation, and initial IT authorization before guessed subject/grant lookup. Actual PostgreSQL race proofs remain implementation acceptance.


### Batch 69 - Survey Manager resolution authority: written-design revision (2026-10-01)
- Owner direction: Survey Manager should also decide the responsibility resolution because they manage Superintendent demotion/removal. Decision25 supersedes the IT-only/Manager-read-only restriction only for Decision24's supported SURVEY_REVIEWER first slice. Scope approval is recorded; revised written-spec and subsequent plan reviews remain pending.
- State: phase5 linked verification worktree at8ff53e5522dacd0c92bdcaaae905efb5535901c2, synchronized0/0 with fetched origin/phase5 before edits. Original dirty D: Phase5-RedTeam checkout and unrelated work preserved. Production source remainsfb45827.
- Design revision: current project active non-subcontractor Survey Manager OR existing central/project IT, purpose-specific authorization without changing assertAccessAdministrator; Manager uses existing editable-personnel population and role editor's shared resolution controls. Same existing exact-Area replacement grant plus individual visibility witness, separate role change, no automatic cleanup. Recheck/hold actual authorizing membership/account/company evidence before fresh saves and historical retry; record authority branch and membership in atomic resolution audit. Add Manager positive, scope/lost-role/company/race/replay and unrelated-admin denial acceptance cases. Acting/FIELD_COORDINATOR/department and broader account lifecycle remain gated.
- Files: revised written specification, Decision25, current PRODUCT authority statement, protected-contract audit follow-up, Team Management status and this entry. No implementation plan, source/API/test/migration changes. No Sabine data, attachments, backups, relationships, containers or preview cutover touched.
- Fresh verification: pnpm tsc --noEmit --incremental false,397 tests(0 failed), native Windows production build pass. git diff --check and document self-review required before checkpoint. Linux/PostgreSQL/HTTP/browser checks are not rerun or claimed for this documentation-only revision; actual race/security acceptance remains implementation work.
- Review/handoff: independent read-only review of the revised authorization/coverage/audit/UI contract before owner handoff. Commit and ordinary push the reviewed documentation checkpoint to origin/phase5, verify landing, then present the revised design in chat for the remote owner. Writing-plans follows written-spec approval; no implementation begins from scope approval alone.

- Review correction: explicitly retain checked actor account active/session-version state and Manager actor company id/type alongside authority membership evidence, so later changes do not erase the authorization proof. No token/credential/session-secret capture. This closes a retained-evidence gap in the proposal; no runtime vulnerability or implementation fix is claimed.
- Final independent review: retained-authority evidence gap confirmed closed; no remaining Critical/Important design findings. Revised design suitable for owner written-spec review. Static review and clean documentation diff do not certify runtime authorization, persistence or concurrency.


### Batch 70 - temporary additional-Area coverage: written-design revision (2026-10-01)
- Owner direction: another current Superintendent may temporarily take an additional Area until a permanent replacement is identified; they need not already cover it. Decision26 supersedes existing-coverage-only restrictions for this narrow handover, preserving the replacement's current Areas and Decision25's project Manager authority. Atomic missing-coverage creation and manual future handover are proposed specification details pending review.
- State: clean phase5 linked verification worktree at51b32663f2393c5995353edf864d9407a0cc8cc1; fetched origin/phase5 matches0/0. Original dirty D: Phase5-RedTeam checkout preserved. Production source remainsfb45827; Sabine identities/data/attachments/backups/containers/preview untouched.
- Evidence/design: executable coverage needs both SURVEY_REVIEWER grant and individual Area visibility. New person-based replacement selection includes eligible Superintendents without that Area. Explicit reuse versus assignAdditional modes; second confirmation for missing coverage; create only missing exact-Area rows, retain existing provenance/other Areas, soft-revoke selected departing grant, audit/ledger atomically. No historical row revival. Migration022 supports existing grant/revocation actions and an active-grant unique constraint; proposed nullable evidence now admits handover-created grant events. Generic Area insert races/duplicate witnesses and responsibility uniqueness conflicts require actual rollback/race acceptance rather than invented global uniqueness.
- Scope/lifecycle: temporary-until-confirmed-manual-handover proposed, no automatic expiry/acting model. Separate role changes and Superintendent Area/reporting/crew cleanup remain protected and unfinished. No standalone grant/Area builder, promotions, account lifecycle, acting/FIELD_COORDINATOR/department mutation, ticket rewrite or real staffing import.
- Files: revised specification, Decision26, current PRODUCT authority statement, protected-contract audit, Team Management follow-up and this entry. No source/test/API/migration or implementation-plan changes.
- Fresh verification: nonincremental TypeScript,397 tests(0 failed), Windows production build pass. Linux/PostgreSQL/HTTP/browser not rerun or claimed for this documentation-only change. Documentation diff/UTF-8/placeholder self-review and independent security/persistence/contract review precede checkpoint; real runtime/concurrency certification remains implementation acceptance.
- Handoff: commit and ordinary push reviewed docs to origin/phase5, verify remote landing and present the revised example/design in chat. Written-spec review still precedes writing-plans; plan approval/execution selection precedes code. Current owner direction is recorded without treating unseen artifacts or temporary-expiry semantics as already approved.

- Review correction: additional coverage now requires explicit TEMPORARY or PERMANENT handover intent. The later permanent successor can receive missing coverage through the same scoped command without being falsely labeled temporary. Intent is retained audit/UI description, not a role/acting permission or automatic expiry, and is bound to confirmation/retry payload; reused rows retain original provenance. Acceptance covers the permanent-successor path.
- Final independent review: temporary/permanent intent contradiction confirmed closed; no remaining Critical/Important design findings. Suitable for owner written-spec review only. Source unchanged; real authorization, creation, audit and two-session behavior still require the implementation acceptance suite.


### Batch 71 - approved Survey Reviewer design: implementation-plan checkpoint (2026-10-01)
- Owner stage approval: "Approved" to the b4548e5 revised written design/remote summary, including temporary additional-Area coverage ending through confirmed handover. Decision27 and spec status record this exact approval; the newly written plan and execution method remain pending.
- Role/scope: sole design/planning authority, using Superpowers writing-plans; no parallel writers or plan-review subagent (skill self-review performed inline). Inspected actual route/application/repository/auth/idempotency/UI/migration/test conventions to choose exact interfaces/files rather than reopening approved requirements.
- State/baseline: clean phase5 linked verification worktree atb4548e50e902807283a895770a45f4c2410ae740, fetched origin/phase5 matches0/0. Fresh pnpm tsc --noEmit --incremental false,397 tests(0 failures), native Windows production build pass. Linux/PG/HTTP/browser not rerun for this documentation-only checkpoint. Original dirty D: checkout and Sabine state preserved.
- Plan: docs/superpowers/plans/2026-10-01-survey-reviewer-handover.md, two sequential reviewable TDD tasks/checkpoints: scoped API/read/additive audit/atomic missing-coverage handover with negative/rollback/actual two-session/HTTP acceptance, then shared Manager/IT controls with immutable displayed token/uncertain retry/focus and real desktop/mobile acceptance. Exact DTO/repository/use-case/handler/component interfaces, named tests/assertions, gates/commands and disposable fixture constraints included. Recommend Native single implementer with independent read-only reviews at both required checkpoint boundaries; sequential subagent-driven option available.
- Self-review: spec-to-task coverage, shared type/property/signature consistency, five Review Focus cases with owning tests, step specificity and proportion checked. Clarified standalone before/after migration proof on a separate fresh disposable run, not existing empty030 state, and transaction authentication after lock waits before replay. No TBD, silently widened scope, generic authorization changes or assumed Superintendent cleanup. No source/test/API/migration/runtime or retained-data changes.
- Handoff: inspect diff, docs checks, commit/ordinary push to origin/phase5 and verify landing. Present concise plan in chat to remote owner for plan review and execution selection; do not begin implementation from prior spec approval alone. Production behavior changed: no. Broader Phase5 remains active at separately scoped gates.


### Batch 72 - protected Survey Reviewer handover API (2026-10-01)
- Approval/state: Decision28 records "Native execution approved" for plan e1568f2 and Decision27 design. Sole native IMPLEMENTER; independent read-only reviews, sequential API/UI pushes. phase5 linked verification worktree at e1568f24869113dce0028ec2d03a3e2f59a09205, fetched origin matches0/0; original dirty D: Phase5-RedTeam checkout preserved. Fresh baseline397 tests, nonincremental TypeScript and Windows build passed.
- Behavior: purpose-specific current project Survey Manager/project IT/central IT private GET/POST; bounded personnel/obligation/candidate pages and consistent full-population checksum. Manager editable-person fence remains. Reuse complete exact-Area coverage or explicitly create only missing review grant/individual assignment with TEMPORARY/PERMANENT intent; then revoke one selected grant. Preserve other Areas, departing individual/reporting/crew/role/account/ticket history. Assignment-only addition gets truthful separate annotation, not a false old-grant label/event.
- Persistence/security: migration030 adds nullable object resolution_evidence only on existing RESPONSIBILITY_GRANTED/REVOKED actions. Actual held membership/account/company authority and created/reused coverage retained atomically with revocation/ledger. Current bearer/session/authority/editable project precede replay, checked again after waits; historical unchanged retry never recreates coverage. Sorted shared subject/company/membership/Area/witness locks and sorted grant locks; uniqueness conflict409/full rollback, no hidden retry/global uniqueness claim. Generic IT helpers/navigation and role guard unchanged.
- TDD: observed expected missing schema/exports/command RED before production changes, then focused GREEN. Review-driven RED/GREEN closes cached read-role race, unheld late IT membership evidence and inactive/session401 contract. Genuine per-call fault transactions replace a weak harness cleanup assertion; failures at assignment, grant, revocation, either audit and ledger leave no persisted side effects. Tests include UUID canonicalization/control filters, actual ticket visibility/review after coverage and unchanged departing records.
- Fresh verification:415 tests(0 failed), nonincremental TypeScript, Windows production and Docker Linux runtime-target builds pass. Standalone before/after migration14; incumbent PostgreSQL264 (teams63/KPI20/safety42/unlink35/workforce74/repair30), new scoped/command/fault PostgreSQL191, actual two-session128 and post-lock expiry/revoked-bearer/multi-project15. Production native Windows Next15.5.12 on loopback3107: new real-cookie handover54; incumbent safety11/KPI15/read10. Staffing-read23 and its HTTP10 used a separate fresh two-tenant/no-roster prerequisite profile, preserving the primary fixture. No Sabine fixture used.
- Regression reconciliation: old Batch52 KPI HTTP expected200 for outside-person metrics conflicts with later approved Batch66 assigned-person404 contract/accepted tests. Reproduced404 in unchanged source; corrected only stale expectation, kept request-list empty200. Staffing-read initial failure was omitted prerequisite; separate gated profile fixed evidence without product change. Concurrency ledger assertion narrowed to tested actor/project endpoint after HTTP created independent synthetic history.
- Files/scope: new Tenancy types/read/command/repository, protected-obligations handler/route, migration030, tenancy unit and beta migration/Postgres/race/session/HTTP scripts; .dockerignore excludes ignored Superpowers ledger; one corrected incumbent HTTP expectation; approved status/decision/audit/plan docs. Cross-path changes are the approved single API increment. No general refactor/dependency/permission builder or audit enum.
- Limits: shared Manager/IT UI remains Task2; no complete Superintendent departure cleanup, other protected-type contracts, automatic expiry, retention/purge, real Sabine assignments or deployment. Actual bounded local tests do not certify load/soak/physical-device/assistive-technology/hosted recovery acceptance or global in-flight logout serialization. Independent checkpoint review and remote landing evidence follow below.

- Checkpoint review correction: independent reviewer found historical replacement-role/account and protected-subject replay acceptance missing. Added actual exact-key handler/repository retries after each independent role/deactivation/session/company/subject-role change; original response and persisted grants/assignments/audit/ledger/account/membership snapshots remain unchanged.191 total scoped PostgreSQL checks pass; no production behavior change.

- Final independent API review: replay acceptance fix inspected and resolved; no remaining Critical/Important findings, ready for checkpoint. Reviewer independently ran18 focused unit tests; database/build/runtime results above are executor-observed, not inferred from review. Deferred/declined items remain explicitly outside this approved slice.


### Batch73 - shared Manager/IT Survey Reviewer handover controls (2026-10-01)
- State/approval: Decision28 native execution continues from verified pushed42f84b56ab6e83bca6814fba609caebab5d454f3. Sole UI implementer, separate read-only functional/visual review; no parallel implementation or dirty original D: changes. Approved Decision27 contract unchanged.
- Behavior: shared ProtectedSurveyObligations outside Manager RoleEditor form and independent existing IT admin Card. Manager selected-person and IT bounded discovery; central IT without operational membership works despite unrelated denial. Closed Manager role/obligation view is read-only. No new navigation/general authority. Preview actual missing/reused rows and original added-row intent separately; explicit additional coverage intent and both confirmations, retained other Areas/roles/history and manual temporary handover.
- State/interaction: immutable displayed snapshot through search/pages, candidate mismatch and every definitive409 latch through cancel until deliberate reload. Pending/uncertain stable payload/key/selection plus adjacent role save/dismissal freeze, synchronous duplicate submit guard. Late reads ignored. Forward/back/success heading focus; success refreshes current blockers and clears separate role confirmation without demotion.
- TDD/review:8 initial reducer cases RED missing helper and real browser RED missing controls before implementation, then GREEN. Independent review found generic409 reload contract, missing actual pending/double-submit evidence and forward focus gap. Ninth unit RED missing classifier and actual browser RED focusfalse observed before minimal correction;9focused GREEN. Real generic409 from own synthetic unsupported-grant change then restore remains reload-blocked. Gated realPOST response + two duplicate form submissions proves one POST; injected lost response then unchanged-key retry yields one atomic event pair. Independent rereview personally ran9tests/diff check and resolved all3 findings; no remaining Critical/Important/Minor findings.
- Fresh final verification:424tests(0 failed), nonincremental TypeScript, Windows production build and Docker Linux runtime-target build pass (swrtracker:reviewer-ui-final-20261001). Fresh standalone before/after migration14 and runner skip; newly migrated separate regression profile teams63/KPI20/safety42/unlink35/workforce74/repair30, protected190 on fresh setup (191repeat includes existing-fixture sentinel), actual two-session128 and post-lock expiry/revoked-bearer/multi-project15. Separate new fresh two-tenant/no-roster staffing-read profile teams63/read23. Actual native Windows Next15.5.12 loopback3107 HTTP safety11/reviewer54/KPI15/read10. Harnesses that print production image were exercised against the native production bundle here; no deployed-image claim.
- Browser:72 actual new handover checks desktop1440/mobile390, real login/cookies/API/SQL, Manager/current projectIT/centralIT without membership, other-project/former/Sub Manager/field denials; reuse/missingone/missingboth, permanent successor/Jason Area2 retained, unsupported/archived/remaining role blockers, read errors/loading/empty/delayed response, search/page retained selection, stale409/cancel/reload, pending duplicate suppression, uncertain stable retry and keyboard focus. Only network-loss/read-delay injection is synthetic transport; server mutation/authorization are real. Existing browser regressions96workforce/27repair at1440/390,57unlink and89staffing at1440/390/810 pass.
- Impeccable: context/new-work/craft-floor; precisely approved local Operate extension inherits incumbent Axiom. One detector run[]; valid document-top1440x2712/390x4812captures inspected, ignored. Fresh shipped-contract finish review ship/no material fixes; read-only documenter checks current palette/Roboto/square controls/rounded fields/panels and600px stacking. Updated surface brief/related targets; DESIGN/sidecar unchanged. Existing sidecar radius drift is unrelated deferred evidence, not silently repaired. Generic collaboration agents adapt the shipped review/documenter contracts because harness has no agent-type selector.
- Documentation/files: new component, view helper/unit/browser; actual apiClient, RoleEditor/admin integration; PRODUCT, Team Management, spec/plan, two current audit follow-ups, surface brief and this append. No migration/backend changes in this UI increment. Disposable QA profile labels/URL/preconditions checked before switches; all previous QA datasets preserved. Sabine3106/15488/data/attachments/backups/relationships untouched.
- Limits/next: approved one-grant handover completed at local evidence scope; full Superintendent departure/remaining Area/reporting/crew cleanup and other protected contracts need their own approval. No automatic expiry/purge/general account lifecycle/imports. Local Edge widths/HTTP/locks do not certify physical-device/assistive-technology/load/soak/hosted recovery/ACL/proxy/deployment acceptance. Review diff, ordinary UI checkpoint push/landing, final fresh whole-range review, then reassess authoritative queue; no unapproved cleanup implementation.


### Batch74 - final handover review, parent-command guard and queue boundary (2026-10-01)
- State: approved native plan executed in two sequential pushed checkpoints: API42f84b56ab6e83bca6814fba609caebab5d454f3 and UI4cbf08e44a28f51dff39cd4179ac215531e98862. The final review covers e1568f2..4cbf08e; original dirty D: Phase5-RedTeam checkout and retained Sabine data/attachments/containers/backups remain untouched.
- Independent whole-range review: fresh most-capable read-only reviewer inspected spec/plan/source/migration/harnesses and independently ran424 unit tests (including27 focused), nonincremental TypeScript and diff-check. No Critical/Important persistence/security findings; one Minor parent-busy omission. Reviewer did not rerun mutation acceptance or builds; those remain executor evidence. All declined-to-judge boundaries and executor rulings are retained in the completion audit follow-up.
- Repair: regraded the parent-busy omission as Important to the already-approved adjacent-command coordination contract. A prepared handover remained submittable during a real pending role PATCH despite disabled being supplied. Actual browser RED false!=true observed before production change. Only final submit button and handler now honor disabled; uncertain same-key retry remains permitted. Added held real409 role response plus duplicate requestSubmit assertions; no role/authorization/repository/schema change. This is one TDD final-review fix pass, not a new subsystem or polish round; no second full-range review dispatch.
- Fresh executor verification after repair:75 actual real-session handover browser checks pass, full424 unit tests(0 failed), pnpm tsc --noEmit --incremental false, native Windows production build and Linux Docker runtime-target build pass (swrtracker:reviewer-overlap-final-20261001, config sha256:d88721cf6576d2bf1726a72ec831ccaf9fa4376fd4f791d1c3a131ab58668dd2). Windows Next loopback3107 uses only identity-verified reviewer-ui-final disposable PG; only transport delay/loss is injected. Existing schema/SQL/race/session/HTTP/incumbent browser evidence remains Batch72/73, not newly rerun for this UI-only guard.
- Documentation: plan Task2 Step6 now checked from verified actual4cbf08e landing; spec status records both pushes. Completion audit contains current-state queue, final review, every ledger ruling and retained gate. No new owner decision recorded. No overall Phase5, complete Superintendent departure or deployment completion claim.
- Next material gate: Decision27 explicitly retains departing individual Area/reporting/crew obligations. Recommend owner selection of a narrow next design for explicit Superintendent Area unlink after complete replacement coverage and explicitly resolved reporting dependencies, retaining other Areas/history and separate guarded role changes. This recommendation does not authorize implementation. Broader protected contracts, central IT lifecycle/investigation, real Sabine mapping, exports and deployment acceptance need their own specified decisions/design/environment evidence. No additional implementation task remains under the completed approved plan.
- Checkpoint: review only explicit source/browser/docs diff, ordinary commit/push to origin/phase5 and re-fetch/verify landing. Preserve managed checkout; no branch integration decision. After commit, remove only this plan's ignored ledger workspace after absolute-path containment check; durable review/rulings live in this batch and audit, all unrelated .local QA state remains preserved.


### Batch75 - approved next direction: Superintendent Area-unlink written design (2026-10-01)
- Owner stage: "Approve option 1" to the recommended next written design after verified pushed0f3ab1e. Decision29 records only explicit Manager Area unlink after complete replacement coverage and deliberately resolved dependent reporting; no unseen written specification/plan or execution approval is inferred.
- State/role: sole design authority, Superpowers brainstorming architectural path and verification-before-completion; no parallel implementation. Clean phase5 linked verification worktree at0f3ab1ee8cb7303c7fb3054d8e4ee757689f92aa; fetch confirms origin matches0/0. Recent API/UI/final-guard checkpoints inspected. Original dirty D: checkout and all retained Sabine data/attachments/backups/containers remain preserved.
- Design basis: current PRODUCT/DESIGN, CLAUDE/AGENTS/requirements, latest owner log/CODEX, Team Management and audits against actual staffing save/unlink/role guards, shared protected handover, setup AOR paths, repositories and migrations011/024/030. Existing Chief reporting tools can explicitly transfer/unlink dependencies; individual Superintendent unlink is the missing distinct capability. No completed handover or other Phase5 subsystem reimplemented.
- Proposed contract: docs/superpowers/specs/2026-10-01-superintendent-area-unlink-design.md. One live top-level individual assignment row, active eligible Superintendent, explicit distinct current complete exact-Area review+individual replacement witnesses, no missing-coverage creation or reporting move. Existing Manager staffing authority; IT-only reviewer handover unchanged. Conservative subtree/project-wide responsibility and unparsed acting refusal; actual dependent reporting includes retired/inactive cases. Duplicate/overlapping individual coverage remains explicit, department records stay unchanged without inferred Superintendent scope, role change separately guarded. Bounded new GET modes/distinct PATCH action on current staffing resource; original contracts/checksum preserved.
- Persistence/UI proposal: same-transaction soft deactivation, versioned existing survey.staffing_saved evidence and idempotency result, no migration/event enum; current actual held actor/session/project authorization before historical retry, consistent displayed rows/count/token, exact stale reload and frozen unchanged retry. Proven project/FK-compatible lock order must be verified against actual current writers with both-winner-order races/faults. Manager RoleEditor extension coordinates cleanup/role/handover in both directions; no new navigation/system/dependency/account permissions. Written spec names actual negative/rollback/SQL/session/HTTP/browser requirements and limits.
- Fresh baseline:424 tests(0 failed), pnpm tsc --noEmit --incremental false and native Windows production build pass at unchanged product source. No new behavior test or fabricated RED for this docs-only checkpoint. Linux/PostgreSQL/HTTP/browser not rerun or claimed; earlier implementation acceptance remains Batch72-74, not proof of this unimplemented design.
- Files: new written spec, exact Decision29, PRODUCT/Team Management direction, protected-contract and completion audit follow-ups, this append. Spec self-review checks placeholders/contradictions/scope/ambiguity. Independent read-only authorization/persistence/concurrency design review before commit; verdict follows below. No production/API/test/schema/runtime/deployment change. Written-spec approval permits writing-plans only; later owner plan/execution selection remains required.


- Review correction/self-review: actual Superintendent visibility traverses only individual aa.user_id assignments. Replaced false department-derived visibility wording with duplicate/overlapping individual coverage and retained department diagnostics, including acceptance assertions. No department permission/role-blocker inference. Clarified nonnegative safe-integer offset and one canonical subject-state checksum across modes/selected links/pages. No source change or claimed new behavior test.
- Final independent design review: ready for owner written-spec review, no remaining Critical/Important/Minor findings. Reviewer inspected actual authority/staffing/role/visibility/schema/writer paths and corrected docs; no mutation/build acceptance or suite rerun claimed by reviewer. Root freshly reran424 tests/nonincremental TypeScript and confirmed seven UTF-8 documentation paths only, diff-check clean. Windows build passed earlier this checkpoint on identical product source.
- Declined-review rulings: inactive/former-role and acting/FIELD_COORDINATOR/department resolution stay excluded under Decision29's narrow direction; complete departure/other Areas/ticket reassignment/account lifecycle stay separately gated. Actual executable SQL/fault/browser correctness is unimplemented and must be proved during approved execution, never certified from this design. Hosted/device/assistive-technology/soak acceptance remains external; unrelated incumbent role-editor repair is not part of design work. Costs are residual blockers and later verification/design, not silent authority widening.
- Handoff: explicit docs-only staged review, commit/ordinary push origin/phase5 and verify landing; remote-readable written-spec summary in chat. Ask for approval of the concrete written spec before writing-plans, per Superpowers architectural gate; do not re-ask the settled option1 scope. No additional implementation can proceed across this gate, and no Sabine cutover or broader branch integration is requested.


### Batch 76 - approved Superintendent Area-unlink design: implementation-plan checkpoint (2026-10-01)
- Owner stage approval: "Approved" to the f9560f5607f9b58345cb8ef5689446c4727fa18a written specification/remote summary. Decision30 and spec status record this concrete contract approval. New implementation-plan review remains pending; preserve the prior Native execution preference rather than ask for execution selection again.
- Role/state: sole design/planning authority, Superpowers using-superpowers/writing-plans/verification-before-completion. Clean phase5 linked verification worktree atf9560f5, fetch confirms origin matches0/0; recent handover/API/UI/guard checkpoints remain implemented. Original unrelated dirty D: Phase5-RedTeam checkout and retained Sabine database/attachments/backups/preview containers remain untouched.
- Plan: docs/superpowers/plans/2026-10-01-superintendent-area-unlink.md, two sequential native TDD/reviewable pushed checkpoints. First: exact Manager staffing GET modes/PATCH, canonical subject checksum, reuse-only coverage, subtree/acting/protected refusal, conditional exact assignment deactivation/version1 existing staffing audit/historical retry with real rollback/writer/session/HTTP acceptance. Second: Manager RoleEditor section with current witnesses, reporting guidance, immutable displayed evidence, frozen exact retries and synchronous three-way role/handover/cleanup guards, actual desktop/mobile acceptance. No IT-only cleanup, migration/event enum/new dependency, account lifecycle or reporting move.
- Inspected actual incumbent staffing handler/deps/checksum/evidence ports, protected reducer/component/API client, RoleEditor/useTeamCommand, fixture/script guards and prior plan acceptance conventions. Focused transport dispatcher preserves old handlers/deps/body stream/status contract; additive private/no-store cache metadata at GET/PATCH resource boundary. Scoped role-uncertainty handling stays in RoleEditor, without refactoring other command consumers. Successful adjacent commands invalidate sibling drafts for deliberate reload, never silently rebase their tokens.
- Fresh verification:424 tests(0 failed), pnpm tsc --noEmit --incremental false and native Windows production build pass on unchanged product source. Logs remain ignored local QA state. No new behavior tests/fabricated RED, Linux/PostgreSQL/HTTP/browser mutation acceptance or deployment claimed for this docs-only planning checkpoint; those are explicit implementation acceptance requirements.
- Inline plan self-review: all spec sections assigned, exact DTO/port/handler/client/view names and audit field/version/endpoint namespace checked, five Review Focus cases pinned to owning tests, bite-size TDD/verification/commit steps and proportion checked. No plan-review subagent per writing-plans inline self-review instructions. Real incumbent-writer incompatibility remains a stop/reassess gate; no speculative lock architecture/retry or authority widening.
- Files: new plan, approved spec status, Decision30, PRODUCT/Team Management stage update, protected-contract/completion audit follow-ups and this append. Production behavior changed: no. Other protected/inactive/former/full multi-Area departure/account/retention/hosted acceptance gates remain.
- Handoff: UTF-8/source-scope/diff/staged review, ordinary commit/push to origin/phase5 and matching remote SHA/0:0/clean verification. Present concrete two-checkpoint plan in chat for remote owner review, wait before Native implementation per writing-plans; do not re-ask settled design or execution-method questions.


### Batch77 - bounded Superintendent individual Area-unlink API (2026-10-01)
- Owner/authority: latest "Approved" to deb74ef plan records Decision31; Native execution preserved. Sole implementer uses Superpowers executing-plans/TDD/systematic-debugging/verification-before-completion and independent requesting/receiving-code-review. Existing isolated phase5 worktree; original dirty D: and retained Sabine unchanged.
- Behavior: three bounded Manager staffing read modes and strict distinct PATCH action unlink-superintendent-area. Actual current project Manager+IT accepted through Manager role, IT-only denied. Canonical subject checksum across link/mode/page/search; one SQL authority/rows/count/token read. Reuse-only exact active review/individual replacement coverage, cycle-safe subtree reporting/protected and conservative any-acting refusal. One exact assignment conditional soft update, existing version1 staffing audit and idempotent result atomic. Historical replay retains current actor/project/session/ownership checks and post-wait active auth, without recreation after subject/replacement loss. Existing Chief APIs/checksum and separate role guards retained; no migration.
- Fresh verification:433 tests(0 failed), nonincremental TypeScript, Windows build, Docker Linux runtime-target build pass. New actual PostgreSQL23 scoped reads+86 commands,81 actual writer/raw-row compatibility races,32 postwait sessions and79 real production HTTP checks including discarded response body/exact recovery. Existing team63/safety42/unlink35/workforce74/repair30/protected190 read+151 command/128 race/15 session pass. Existing HTTP handover54/staffing safety11; browsers89staffing/57unlink/96workforce/27repair/75handover pass. Separate fresh profiles team63 each; KPI20 SQL/15 HTTP/desktop-mobile browser and Chief bounded23 SQL/10 HTTP pass. Detailed runtime/fixture/image provenance and limits in audits/superintendent-area-unlink-completion-20261001.md; logs/private QA state ignored.
- Review: fresh read-only API review finds no Critical/Important/Minor code issue; independently9 focused tests. Response-loss acceptance caveat resolved by actual discarded-body run; root supplied all remaining completion gates. Declined boundaries/rulings/costs retained in audit, no reviewer report substitutes verification.
- Documentation: Decision31, CLAUDE version1 payload, PRODUCT/Team Management/status/protected audit/spec execution update, plan completed API steps and new completion evidence.
- Checkpoint: explicit own paths only, diff review, ordinary commit/push origin/phase5 and fetched equal SHA/0:0/clean verification. Task2 UI/three-way synchronous pending/uncertain coordination continues under the already approved plan without another approval request. Complete departure, other protected contracts, account lifecycle/retention and hosted/device acceptance remain material limits.


### Batch78 - Manager Superintendent individual Area cleanup controls (2026-10-01)
- Approved basis/native execution: Decision31 two-task plan, verified API checkpoint e03f9d2. Sole native implementer; Superpowers executing-plans/TDD/systematic-debugging/verification-before-completion, consequential requesting/receiving-code-review and Impeccable existing Operate surface. No parallel implementation. Original dirty D: Phase5-RedTeam and retained Sabine untouched.
- Behavior: selected Superintendent RoleEditor gets bounded exact assignment/covered replacement/dependent Chief evidence and separate confirmed reuse-only unlink. Retained duplicates/overlap/department diagnostics are truthful; reporting uses existing staffing guidance, not a second editor. Shared displayed checksum across modes/link/search/pages; late-generation/person responses ignored. Current read409 and every mutation409 stale-latch through cancellation until deliberate reload. Unknown/5xx mutation outcomes freeze exact payload/key; role uncertainty wrapper remains local, other useTeamCommand consumers unchanged. Immediate lock refs plus buttons/handlers block all6 directed role/handover/cleanup overlaps and duplicate requestSubmit. Success reloads own evidence, invalidates sibling draft and clears separate role consent without demotion.
- RED/GREEN: reducer7 and real missing-region0!=1 before production UI; one review fix pass adds generation-safe read409 RED, real no-source advice0!=1 RED, then reducer8/98 actual browser GREEN. Test-harness debugging fixed premature unroute before retry fulfilled, precise generic banner matching and actual UUID page ordering; no production permission/locking change.
- Fresh verification:441 tests(0 failed/cancelled/skipped), pnpm tsc --noEmit --incremental false, native Windows build and Docker Linux runtime build swr-area-unlink-ui:phase5 sha256:a49b33e764f2830d474aea19bdcd149d5a0718e620cf3ac5e44ce47c08d9c8d3 pass after review repair. Native production Next loopback3107 on newly owned migrated synthetic PG15489. API SQL23 read/86 command,81 races,32 postwait sessions; HTTP79. Browser98 at1440/390 covers bounded pages, real search/mutation token mismatch, late reads, pending/uncertain all6directions/direct-submit, exact one-audit lost-response recovery, full temporary review handover+explicit Chief transfer+cleanup, retained duplicate/otherArea/role, unavailable coverage/filtered recovery, inactive retired reporting, unsupported and archive. Transport delay/status/loss labelled synthetic.
- Incumbent fresh checks:team63, safety42,unlink35,workforce74,repair30; protected190read/151command/128race/15session, HTTP54; safetyHTTP11; browsers89staffing/57unlink/96workforce/27repair/75reviewer. Separate valid fresh profiles team63 each, KPI20SQL/15HTTP/1440+390browser and Chief bounded23SQL/10HTTP pass. After Area-only recovery fixes, new98browser/79HTTP/incumbent75reviewer rerun; unchanged SQL/writer evidence not falsely claimed repeated after that UI-only repair.
- Review: fresh read-only consequential Task2/integrated API-UI reviewer independently25focused tests; no Critical issues. Root regraded two Minor-labelled recovery contract findings to Important, fixed both in one bounded TDD pass; no unaddressed material finding or authority broadening. Independent visual finish ship/no material fixes, detector[] once; final valid document-topcaptures rechecked. All declined boundaries/rulings/costs retained in audit; final committed whole-range review follows completion, no self-certification from agent reports.
- Documentation: PRODUCT/TeamManagement/protected/status/spec/plan and actual surface brief, completion audit. Existing DESIGN/sidecar/tokens/CSS preserved; no new imagery/brand/nav/migration/dependency. Explicit own paths only, reviewed diff, ordinary UI checkpoint commit/push origin/phase5 and fetched equal SHA/0:0/clean verification.
- Remaining material gate/queue: this approved bounded plan ends here. Further inactive/former/acting/FIELD_COORDINATOR/department blockers, central IT account/company/member/invitation lifecycle and consolidated permission investigation, real Sabine mapping, scoped exports and operational deployment each need a concrete approved contract or owner-controlled acceptance evidence. No additional sufficiently specified independent implementation selected. Recommend owner selection of a bounded central IT lifecycle/investigation design next; downside: remaining unsupported staffing blockers stay gated. Read-only investigation and acceptance preparation can continue without mutation, not a substitute for owner contract approval.


### Batch79 - Superintendent Area cleanup final review and queue boundary (2026-10-01)
- State: approved native Decision31 plan completed in two verified pushed checkpoints, API e03f9d2c71b575ce94ac2dfc3d748bc08d3d8d21 and Manager UI 0c1e1b81b715c81a010ebf2c362cdc279f61c952. Ordinary push/fetch verified matching origin/phase5,0/0,clean at each. Original dirty D: Phase5-RedTeam checkout and all retained Sabine data/attachments/backups/preview remain unchanged.
- Final independent whole committed-range review: deb74eff6652327bdea5ddea748b9b3d765e86b3..0c1e1b81b715c81a010ebf2c362cdc279f61c952; no Critical/Important/Minor findings; all five plan focus conditions checked. Reviewer independently17 focused pure tests and committed diff-check pass; broader acceptance remains root evidence. Every declined behavior and executor ruling/cost is retained in audits/superintendent-area-unlink-completion-20261001.md. No new code fix or repeated review after clean verdict.
- Verification: task-done freshly reran441 tests(0 failed/cancelled/skipped); root nonincremental TypeScript passes at committed UI head. Actual Windows/Linux builds, new98 browser/79 HTTP and SQL/race/session/incumbent counts remain Batch78; no claim that documentation-only completion reran product builds or mutation acceptance. Final root precommit pnpm test passes441/441 with no failures/cancellations/skips, nonincremental TypeScript exits0 and diff-check is clean on this documentation-only completion tree.
- Documentation: actual plan Task2 Step9 checked from verified0c1e1b8 landing; spec/plan current status closes already-approved execution while retaining historical preparation as historical. Completion audit records pushed SHAs, final review, ledger additions and current-state queue. Phase5 completion audit links the final bounded outcome. No new owner decision, production behavior, schema/dependency or environment change.
- Deferred minor: pre-existing design-sidecar preview button/nav radii disagree with normative DESIGN/current square controls. Preserved, not canonized or repaired as part of this functional extension.
- Next material gate: no additional sufficiently specified implementation remains in this plan. Recommend owner selection of a bounded central IT account/company/member/invitation lifecycle and consolidated permission-investigation written design; primary downside is unsupported staffing blockers remain gated. Alternatives: separately scoped protected-blocker design or controlled deployment acceptance preparation. Exact decision is next design direction, not approval of an unseen spec/implementation. Real Sabine mappings, acting/FIELD_COORDINATOR/department/inactive-former contracts, lower-priority export output and operational acceptance remain separate requirements. Read-only investigation/acceptance preparation is independent; no parallel work evades the gate.
- Checkpoint policy: exact owned documentation paths only, root diff review/fresh verification, ordinary commit/push origin/phase5 then fetched landing verification. Preserve managed checkout and unrelated .local QA. After durable records exist, delete only this plan's ignored scratch workspace following resolved absolute containment check; stop only its identity-verified synthetic web helper, never retained Sabine. No branch integration menu/merge/PR is appropriate under the explicit checkpoint instruction.


### Batch80 - owner-requested development stop and path-forward brief (2026-10-01)
- Owner instruction: stop development here and create a brief for later assessment. No new implementation/design authority, automatic continuation, deployment or integration is inferred.
- State: clean phase5 at ad59a931500c5353eeb2339c8bcdf258083e0f65; fetch verifies matching origin/phase5 and0/0. Completed API e03f9d2/UI0c1e1b8 and final review remain Batches77-79; do not repeat completed work.
- Documentation: docs/PHASE5_PATH_FORWARD_BRIEF_20261001.md records the checkpoint, completed scope, evidence limits, candidate queue, exact remaining decisions, recommended central IT investigation direction, alternative paths, resume procedure and preserved deferrals/state. This is a dated assessment index, not an approved new specification or plan.
- Fresh checks:441 tests pass with no failures/cancellations/skips; nonincremental TypeScript passes on unchanged product source. Final documentation-tree441 tests/nonincremental TypeScript and diff-check pass; exact two-document staging verified before ordinary commit/push. No build/SQL/HTTP/browser rerun claimed for the brief. No source/test/schema/runtime/Sabine/original-checkout change.
- Handoff: save/push this documentation checkpoint to origin/phase5 under the existing durable-checkpoint policy, verify landing and stop. Later development requires the owner's resumption and selected assessment/design direction.


### Batch81 - Central IT account offboarding assessment (2026-10-01)
- Intent and authority: owner requested assessment of one account-disable outcome, stopping at design review. Auditor role; no implementation plan, API/type/schema/code changes, data mutations or deployment.
- Baseline: assessed existing clean phase5 checkout C:/Users/xwall/.codex/worktrees/phase5-verification/SWRTracker at 92e5b45894a949448aaf58200f8bddebec52c371. Fresh fetch equal origin/phase5, 0/0 divergence. Original dirty D: Phase5-RedTeam preserved; no reset/force push or unrelated merge.
- Files touched: audits/central-it-account-offboarding-design-20261001.md and this appended documentation record only. No new owner decision recorded and no commit/push.
- Findings: deactivation fields/session rejection primitives exist without an account command. Central IT maps to TENANT_ADMIN only in bounded incumbent contracts. Generic membership/session writes lack transaction/audit/continuity guards; protected authentication combines separate logout and account-state checks. Account audit has no truthful existing tenant-level container. Worker may automatically reassign disabled assignees; routine offboarding therefore proposes explicit prior live-duty resolution.
- Proposed design: specifically approved Central IT command, tenant-scoped identity, no self-disable/last-admin loss, actual Manager continuity, live-duty refusal, unchanged drafts/memberships/company/history/files, deferred separately designed reactivation. Shared/exclusive tenant lifecycle coordination, postwait auth, one atomic account transition/event/retry result; 28 acceptance cases and five explicit owner policy decisions.
- Fresh baseline evidence: pnpm tsc --noEmit --incremental false exits0; pnpm test 441 pass/0 fail/cancel/skip; approved-access native Windows pnpm build exits0. Restricted build attempt stalled and was stopped before rerun; Next15.5.12 url.parse deprecation warnings remain. No SQL/HTTP/browser mutation acceptance, Linux/hosted/device or production readiness claim.
- Gate: design pending owner review. No implementation plan until design approval. Unsupported departures/urgent suspension/reactivation remain separately gated. No retained Sabine data, attachments, backups or preview mutation.


### Batch82 - Project Admin permission inventory and scoped offboarding revision (2026-10-01)
- Role/scope: Auditor, owner-authorized design revision. Policies2–5 approved; owner extends administrative actors to Project Admin, with same person potentially Central IT/Project Admin/Survey Manager. Scope clarified: own projects; local disable flags existing Central IT for review of any needed tenant-wide disable.
- Baseline: existing phase5 worktree HEAD92e5b45, freshly fetched equal origin/phase5,0/0. Preserve Batch81 documentation and unrelated dirty original D: checkout. No commit/push.
- Findings: eight CentralIT-only administrative capability families plus discovery. Several invite/setup/insight capabilities already shared. Scalar project membership cannot represent Manager+ProjectAdmin; tenant-role precedence also hides actual Manager insight semantics.
- Revised design: independent fixed ProjectAdmin assignment alongside existing operational role; local project access-disable distinct from tenant-account disable; explicit scope/authority, preserved other-project access, global-session sign-in renewal, durable nonblocking CentralIT review and standalone administrative outbox. Same-person reviewer allowed; no CentralIT means local disable succeeds without fabricated tenant authority. Tenant-wide effects cannot be broadened by a local ProjectAdmin check.
- Files touched: both audits above, PRODUCT.md direction note, appended Decision32 and this worklog. No product source/tests/API/types/schema/data changes or implementation plan.
- Verification: fresh pnpm tsc --noEmit --incremental false exits0; pnpm test441 pass/0 fail/cancel/skip. Documentation review/diff-check follows. Prior Batch81 native build evidence remains dated; no repeated build, SQL/HTTP/browser/new offboarding mutation claims.
- Gate: revised concrete specification and40 offboarding plus15 parity/stacking acceptance cases ready for owner review. Policy approval does not approve unseen schema/contracts or implementation. Preserve Sabine/attachments/backups/preview.

### Batch83 - scoped offboarding and project administration implementation planning (2026-10-01)
- Authority/role: documentation planning following owner resumption and the revised concrete written-design review. Decision33 records design acceptance for planning, not approval of an unseen implementation plan. Preserve Native execution and original assessment/data boundaries.
- Starting state: authoritative phase5 checkout HEAD92e5b45894a949448aaf58200f8bddebec52c371 equal fetched origin/phase5,0/0; retain all Batch81/82 documents and unrelated original Phase5-RedTeam changes.
- Deliverable: docs/superpowers/plans/2026-10-01-scoped-account-offboarding.md with seven testable tasks, exact shared contracts, proposed migration031, all-writer lifecycle barrier and enforcement-manifest gate, independent admin grants, explicit project versus tenant disablement, durable Central IT review, project permission parity, UI recovery and40+15 acceptance mapping.
- Concrete implementation choices proposed for plan review include project-company association and separate administrative outbox/review APIs; they are not shipped interfaces. Tenant project creation/shared template mutation/tenant-role changes remain Central IT because local authority has no existing project scope for those tenant actions.
- Verification: fresh pnpm test441 pass/0 fail/cancel/skip and pnpm tsc --noEmit --incremental false exits0 on unchanged runtime source. Documentation read-back and diff-check performed. No build, new migration/SQL/HTTP/browser or offboarding behavior acceptance claimed.
- Files: plan, approval/status records in the two assessment documents, PRODUCT.md, this worklog and Decision33. No code/tests/schema/data edits, commit/push or deployment.
- Gate: self-reviewed plan ready for owner review before implementation. Native preference preserved. No retained Sabine data, attachments, backups or preview changes.
### Batch84 - implementation plan direct-query coverage check (2026-10-01)
- Authority: safe documentation preparation while concrete plan review remains pending; no implementation authority inferred from automatic goal continuation.
- State: rechecked phase5 HEAD92e5b45 with prior documentation changes retained. No runtime source/tests/schema/data changes or original checkout mutation.
- Evidence: rg direct lifecycle/membership/version references identifies24 src files. audits/phase5-lifecycle-query-inventory-20261001.md records every path, planned integration and named acceptance assertion; indirect caller coverage remains an execution gate.
- Findings: attachment and draft helpers bypass the common project-role helper, crew/account readers directly query active memberships/users, and worker duty changes need tenant-specific transaction entry points. Expanded exact Task2/3 file coverage in the plan rather than assuming common helper enforcement suffices.
- Corrected contract: existing retry table is api_idempotency; Idempotency-Key header is parsed by requireIdempotencyKey and normalized to1–128 characters. Internal command carries parsed key, public JSON rejects duplicate key. Authorize before replay and lock tenant before ledger.
- Verification: document read-back/source inventory comparison and diff-check; prior Batch83 baseline441/TypeScript applies to unchanged product source. No new SQL/HTTP/browser/build acceptance claim.
- Gate: review of the concrete implementation plan still required; Native preference retained. This preparatory inventory does not certify implementation or authorize deployment.
### Batch85 - approved scoped lifecycle storage, Task1 (2026-10-01)
- Authority: owner read the remote seven-task plan and explicitly approved; Decision34 preserves Native execution and final independent review, no repeat approval between tasks. Existing phase5 worktree reused, original dirty checkout preserved.
- Baseline: freshly441 unit tests/nonincremental TypeScript pass at92e5b45 before source edits. No live migration or deployment.
- Implementation: additive031 migration adds paired tenant/project access provenance, independent admin grants, immutable account lifecycle events, guarded central-review/outbox storage and project-company associations. Tenant identity constraints/preflight refuse legacy inconsistencies. Backfill records LEGACY_MEMBERSHIP/original time with unknown actor NULL rather than fictional provenance; original operational roles remain unchanged.
- Repository/contract: appendLifecycleEvent writes real scoped account audit with server-side ID, tenant identities, session versions, authority evidence/snapshot/reason/correlation. Shared OffboardingScope contracts moved into Task1 because the approved repository interface consumes them.
- TDD: opt-in real PostgreSQL test failed on missing031, then missing recipient integrity and missing repository; GREEN28 checks include preflight, paired stamps, foreign tenants, active grant uniqueness, immutable UPDATE/DELETE/TRUNCATE CASCADE, exact retained row hashes, review recipient deduplication/event linking and actual repository persistence.
- Evidence boundaries: schema fixture uses a unique rolled-back transaction/schema on gated127.0.0.1:15489/swr_team_isolated; existing synthetic acceptance fixtures and retained Sabine unchanged. Current configured isolated app role exercises triggers, not a claim about unknown production privileges. No API/UI/session/writer enforcement or completed Phase5 outcome yet.
- Fresh verification: scoped PostgreSQL28/28, pnpm test441/441 no fail/cancel/skip, nonincremental TypeScript exits0; exact staged diff review/check before storage checkpoint. PostgreSQL cases opt in and are separately counted, not silently credited to normal441.
- Rulings: transactional schema fixture protects incumbent synthetic fixtures (deployment configuration needs final runtime acceptance); truthful legacy grant provenance avoids invented actors (consumers must accept nullable legacy actor); shared scope types move earlier without endpoint authorization; TRUNCATE CASCADE test reaches immutable trigger beyond PostgreSQL's FK refusal.
- Next: Task2 all effective-access/combined-role consumers; then lifecycle coordination, commands/review/parity/UI and integrated acceptance. No new gate between approved tasks.
### Batch86 - combined roles and effective project access, Task2 (2026-10-01)
- Authority: Decision34 approved Native execution; authoritative phase5 worktree, unrelated checkout/data retained.
- Implementation: independent eligible Project Admin and Central IT capabilities coexist with actual Manager role; revoked legacy grant cannot regain authority through retained scalar role. Effective local access applies to common roles, attachment upload, draft recovery, staffing/workforce/team candidates, readiness, protected lifecycle/Area replacements, My Account and notifications; retained histories and inactive diagnostics remain truthful.
- Enforcement manifest: audits/phase5-lifecycle-enforcement-manifest-20261001.md classifies every direct query and additional application/type consumer, with named evidence and remaining writer/release gates.
- TDD: eight resolver failures -> GREEN; two handover eligibility failures -> GREEN; real SQL independent administrative branch failure and retained My Account Area failure -> GREEN. SQL fixture separately exercises disabled cached Manager/Area access, snapshot changes, retained inactive diagnostics, staffing/ticket eligibility, scoped discovery and deduplicated recipients.
- Fresh verification: pnpm test449/449, nonincremental TypeScript exit0; real rollback-only PostgreSQL schema28 + consumer29 checks. Mocked regressions are not counted as actual SQL proof. No build/HTTP/browser/race acceptance or deployment claimed.
- Rulings: grant revocation authoritative over scalar legacy role; optional admin grant witness retained alongside membership; Central IT support stays administrative/redacted rather than fabricated operational authority; only obsolete scalar draft-authority source assertion removed, replaced by actual SQL proof. Auto-review rejected reusable QA setup script; no file written, ephemeral test connection used.
- Next: Task3 tenant-first barriers, postwait auth and all writer families. No new owner gate between approved tasks.
### Batch87 - Phase5 review reconciliation and bounded corrections (2026-10-01)
- Authority: owner requested review branch1b9b61a assessment/reconciliation and continued approved development; owner selected fresh Survey review and approval for direct-return resubmission. Current phase5 checkpoints030a654/917f2b7 retained; original dirty checkout untouched.
- Reconciliation: docs/PHASE5_REVIEW_RECONCILIATION_20261001.md gives every finding A–D and66 practice recommendations a disposition, correction/proof gate or explicit future policy gate. Single-person stacked roles remain approved; no inferred global authority, automatic replacements, reactivation/purge or production cutover.
- Corrections: patched Next/bcrypt plus narrow transitive overrides and audit gates; direct workflow fresh-review exits; insert-only member conflict; escalation-only orphan worker and truthful signal; captured crew stop-work notices; public bootstrap closure; encoded Unicode download header prepared before audit; shared owner-only draft fence; active project requester eligibility; active-work IM continuity; neutral initial/preserved Survey priority; consistent calendar parser; compatible security headers; HS256 and unsafe production-secret guard; generated cache untracked.
- Verification: Windows types/build and normal suite pass; Linux pinned22.23.3 frozen install/audit0/types/466 tests/build/native compatibility and runtime HTTP pass. Real PostgreSQL28 schema invariants plus13 correction checks pass in rolled-back synthetic schema. Fresh independent A0 review found no concrete bypass/regression; reviewer registry EACCES was independently covered by successful primary/Docker audits.
- Remaining: Task3 all writers, atomic administrative audit, SQL races and Tasks4–7 remain open. CSP/transport/onboarding/field-policy/operational pilot gaps retain explicit gates; no blanket pilot-ready/security certification. No live migration/deployment/data modifications.
### Batch88 - tenant/session writer coordination continuation, Task3 partial (2026-10-01)
- Authority: Decision34/35 approved development and review reconciliation; authoritative phase5 worktree retained. Owner A1 answer remains fresh Survey review and approval.
- Implementation: explicit authenticated transaction options take tenant barrier, recheck cookie/logout/current user/version, and current authority before callback/replay. Member insertion, tenant role grant/demotion/removal, logout, initial invitation registration and password reset now use held tenant EXCLUSIVE transactions. Last eligible Central IT removal/demotion refuses409; no lock upgrade or unrelated checkout changes.
- Administrative evidence: additive032 and repository preserve separate immutable real administrative events, same-tenant identity FKs and atomic effect/session/audit writes. Anonymous reset requests honestly leave actor NULL with subject/evidence; other administrative actions require an actor. No ticket fiction, password/token evidence or production migration.
- Identity: reset performs nonlocking token scope discovery, then tenant lock, current user/token locking and disabled-account refusal. Local membership stamps remain unchanged. Initial registration requires a same-tenant bound invite and new identity; duplicate memberships cannot overwrite roles or restore access. Logout records only the presented session and rolls back revocation if audit fails; stale/disabled cookies still clear safely.
- TDD: failed reset-disabled/lock-order/issuance checks -> GREEN; invitation ordering/audit, malformed reset tenant and anonymous audit provenance failed -> GREEN. Normal regression475/475, nonincremental TypeScript and production build pass. Isolated PostgreSQL: schema28; administrative audit6; member route atomic10; reset/logout/registration32; actual two-client tenant coordination27. SQL counts exclude repeated schema checks.
- Evidence limits: administrative/member/identity fixtures are owned rollback-only schemas and route transactions use savepoints; concurrency uses two real clients in a separately owned minimal schema, with observed pg_blocking_pids waits. These do not certify all writer families, real offboarding commands, production privileges, full HTTP/browser flows or the final Linux release image.
- Remaining: Task3 complete writer inventory, ticket/Area/staffing/team/configuration/worker entry points and per-family races; Tasks4–7 commands/review/parity/UI/integrated acceptance and independent whole-branch review remain open. No deployment, live migration, retained Sabine changes, push or final task completion.

### Batch89 - staffing, team and Area tenant-first handlers, Task3 partial (2026-10-01)
- Authority: continuing the approved Native plan, same authoritative phase5 worktree; no additional policy gate.
- Implementation: staffing role-changing POST and team role PATCH select EXCLUSIVE before any domain/replay locks; organizational team mutations select SHARED. Roster/reporting/Area/workforce changes select EXCLUSIVE because the mapped links feed live visibility/authority. Protected reviewer handover uses EXCLUSIVE authority-grant mutation. Each rechecks current bearer identity/version/expiry after the tenant wait before existing operational/context authority gates and saved ledger access; stacked administrative authority remains separate.
- TDD: three post-wait/ordering regressions plus actual SQL exclusive-link mode acceptance failed on missing tenant coordination or saved-response access -> GREEN38 focused checks. Team fixture originally reused one transaction ID across distinct requests; changed it to distinct client objects per request, retaining the production shared-to-exclusive upgrade refusal.
- Actual handler proof: lifecycle-writer-handlers-postgres.ts builds one uniquely owned full schema with migrations through032 on isolated127.0.0.1:15489/swr_team_isolated, uses two real clients and observed pg_blocking_pids waits, commits synthetic global disablement, and verifies eight actual default handlers reject401 without domain/audit/ledger changes.40 checks, original fixtures untouched and owned schema removed.
- Fresh verification:478 normal tests, nonincremental TypeScript and production build pass; diff-check/staged review. Migration/identity checkpoint4229cb3 is retained. No full HTTP/browser/incumbent-release suite or final Linux-image revalidation claimed.
- Remaining: manifest records exact covered and unresolved families. Task3 remains open for ticket/setup/department/company/invite/template/worker integration, complete indirect inventory and per-family races; Tasks4–7 remain open. No production/Sabine migration, deployment, push or milestone completion.
### Batch90 - owner-requested writer coordination checkpoint (2026-10-01)
- Authority: owner requested a checkpoint and push before inspecting and integrating review-branch UI commits f4aa6a1 and8536655. Original dirty Phase5-RedTeam checkout remains untouched; authoritative worktree is phase5.
- Implementation: explicit tenant-first coordination extends to Department/Area/setup/configuration, activation/archive, invitations/company authority, company/project creation, shared template writes and whitelist changes. Current identity and action authority are reread on the held client before effects. Metadata/invitation changes append032 administrative evidence in the same transaction without bearer secrets.
- Ticket actions:24 transition/update callbacks now use withTicketMutation, which holds SHARED tenant authority, rejects stale/logout/disabled sessions and rereads current operational role and bounded visibility before domain locks or idempotency replay. Ticket creation uses one held transaction for current company/department/project authority; draft deletion/recovery takes SHARED before actor/domain locks.
- TDD/evidence: actual default handler races initially failed because setup/invite/create/action paths bypassed the tenant wait; GREEN155 race checks across31 actual entrypoints plus5 department atomic-audit checks. The unique fully migrated owned schema, observed pg_blocking_pids waits and full row snapshots preserve original fixtures; an induced audit failure rolls back department creation, then success records one actual actor event.
- Fresh verification:478/478 normal tests; nonincremental TypeScript and production build exit0. No HTTP/browser, final Linux-image or complete release proof claimed.
- Boundary: this is a development checkpoint, not a deployable offboarding feature. Task3 still needs attachment/download and worker coordination, subject eligibility/complete indirect inventory and remaining per-family proof. Tasks4�7, scoped parity, UI and final independent review remain open. No production/Sabine migration or deployment.
- Next owner priority: inspect the two named review-branch UI commits after this checkpoint is pushed; integrate the approved visual changes while preserving newer lifecycle/authority behavior. Resume remaining offboarding work afterward.


### Batch91 - requested review-branch UI integration (2026-10-01)
- Owner-requested checkpoint b7b79eb was created and pushed to origin/phase5 before UI integration. Reviewed exact review-branch commits f4aa6a19c595446bd1330a5724d92a57dae83cf4 and 85366550760865c52bb3c3317a9913c0aef4f61e, then cherry-picked with provenance as ea8c272 and a800cc6 on authoritative phase5 without conflicts.
- Presentation: compact Axiom shell, responsive project navigation, shared request queues/status tones, details/actions/history, wizard/drafts and administrative layouts; supplied artwork and self-hosted Roboto retained. Current newer lifecycle routes and authorization remain in place.
- Verification: 478/478 normal tests, nonincremental TypeScript and production build pass. Synthetic intercepted requester recovery browser checks pass at1440/810/390; new queue/navigation/card/action/keyboard-focus checks pass28 assertions at1440/390. Existing Need-By assertion now targets the redesigned definition-list field. No live account/data writes.
- Visual evidence: opened21 fresh full-page captures; one manual detector pass. Fresh Impeccable finish reviewer returned ship at captured UI integration scope, no material fixes; intentional selected brand/banner treatments retained. Documenter synchronizes approved design metadata separately from runtime behavior.
- Boundary: this completes the requested visual integration, not the scoped offboarding release. Task3 attachment/download/worker coordination and eligibility/inventory proof, Tasks4-7 and final whole-branch release review remain open. No migration or deployment.
- Documentation finish: DESIGN.md normative shared component tokens and .impeccable/design.json previews synchronize the selected redesign; JSON/reference/heading checks and diff-check pass. No runtime changes from documentation finish.


### Batch92 - coordinated attachment uploads and downloads, Task3 partial (2026-10-01)
- Continued owner-approved Phase5 plan from clean phase5 HEAD4518097. Uploads with and without retry keys now use withTicketMutation: SHARED tenant barrier, fresh bearer/account/version/logout, current operational role and ticket visibility before ticket locks or saved replay.
- Downloads now use the same held transaction for current visibility, attachment lookup, buffered response construction and actual attachment.downloaded audit. Storage bytes are withheld on authorization or audit failure. The database lookup no longer uses an outside pool query. Historical files/authorship are preserved.
- TDD: unkeyed upload initially returned201 after injected revocation; download entered attachment lookup before lifecycle revalidation (500 instead of401). Both RED -> GREEN. Existing upload staging/cleanup, file caps, revision binding and Unicode download headers remain covered.
- RealSQL: expanded uniquely owned fully migrated schema acceptance to34 handler entrypoints and40 race scenarios. Attachment requests wait behind observed pg_blocking_pids barriers and reject401 after global disablement, version-only revocation or logout, before attachment queries/replay/audit. Keyed/unkeyed staging cleans on rejection; actual successful upload/replay retains one object/row, actual download records actor, induced audit failure returns500 without bytes or database change.228 assertions total including earlier families; not228 distinct scenarios.
- Verification:481/481 normal tests, nonincremental TypeScript and production build pass; whitespace check clean. Synthetic submitted-ticket fixture needed valid Area/type/date under the real migration029 constraint; fixed fixture, did not relax schema. Legacy opt-in Sabine fixture adapters updated for the internal dependency shape but not executed on15488; current real proof uses isolated15489 only.
- Remaining: Task3 worker/notification coordination, effective subject eligibility, complete direct/indirect writer inventory and remaining family races; Tasks4-7 and final whole-branch release review remain open. No public API/schema change, production migration or deployment.


### Batch93 - notification worker tenant coordination, Task3 partial (2026-10-01)
- Continued approved Phase5 plan from3dd2c33. Once/loop notification entrypoints inject explicit per-tenant SHARED transaction coordination. Discovery supplies tenant IDs only; timeout/vacancy/orphan candidates and current recipient eligibility are reread on the held client. Dispatch SQL partitions before aggregation, and a crossed tenant result fails before send or audit.
- Preserved approved A3 escalation-only behavior: no orphan assignment, role, grant or history changes. Existing transport contract and worker actor configuration remain; this slice neither creates a transport provider nor represents external delivery as transactional.
- TDD: stale cached recipient dispatched with zero tenant-coordinator calls RED -> GREEN. SQL-partition regression exposed omitted orphan bind parameters; RED -> GREEN. Cross-tenant denial verifies no send/audit.
- ActualSQL: notification-worker-lifecycle-postgres.ts uses a uniquely owned fully migrated schema and two real PostgreSQL clients on isolated127.0.0.1:15489/swr_team_isolated. Observed pg_blocking_pids waits for all three signal families; committed synthetic recipient disablement leads to zero sends/audit/domain changes, positive recipients dispatch once with combined-admin dedup, orphan Chief attribution remains. Three queries additionally exclude a second synthetic tenant;40 assertions. Fake transport only; no real message or incumbent data change, owned schema removed.
- Verification:17 focused notification tests,483/483 normal tests, nonincremental TypeScript and production build pass. Final extra SQL tenant-isolation assertions and strict types pass; diff-check clean.
- Evidence limits: signal transport still precedes audit/commit under the existing contract, so external delivery atomicity/retry leasing and configured system actor validity are not certified. Password-reset outbox delivery bookkeeping/security-record expiry do not grant account access or mutate duties; complete indirect inventory must still classify them. Task3 subject eligibility/remaining writer inventory and family proofs, Tasks4-7 and final branch review remain open. No deployment or live migration.

### Batch94 - owner-requested checkpoint and effective duty subjects (2026-10-01)
- Authority: owner requested a checkpoint pushed to phase5 before inspecting/integrating UI commits f4aa6a1 and 8536655. Those commits already exist on phase5 as ea8c272/a800cc6, with prior acceptance and design synchronization in4518097; do not duplicate their changes. Original dirty Phase5-RedTeam checkout remains untouched.
- Continued Task3: Area assignment, department addition, title assignment and department movement reject globally or locally disabled subjects on the held transaction client. Inactive department records cannot receive titles or moves; inactive actor department scope cannot confer authority. Retained assignments, historical records and stamps are preserved on rejection. Required internal repository port fixtures updated; no public API/schema changes.
- Evidence: new regression cases were RED before guards and GREEN afterward.57 isolated PostgreSQL assertions cover eight observed wait-and-disable races, positive current subjects, tenant isolation, subcontractor role eligibility, retained inactive department rows and inactive actor scope. Owned synthetic schema only; no incumbent data or production migration.
- Verification:491/491 normal tests, nonincremental TypeScript and production build pass; diff whitespace checked.
- Remaining: Task3 complete writer inventory and remaining subject/family proofs; Tasks4-7 and final whole-branch review remain open. This checkpoint is not a completed offboarding release.

### Batch95 - notification operator checkpoint and owner pause (2026-10-01)
- Authority: continued approved Phase5 Task3 until owner requested checkpoint and stop. Notification capture/retry now acquire SHARED tenant coordination and revalidate current bearer and project insight authority on the held client before delivery-state updates.
- TDD: actual notification-capture race returned200 without waiting RED; held-client coordination GREEN. Both actions reject global disablement, session-version changes and logout; permission-only local disablement/role loss deny even with unchanged bearer version. Positive capture/retry retain existing delivery behavior and missing project returns404 without changes.
- Verification: expanded real PostgreSQL writer harness277 assertions across36 entrypoints,46 revocation scenarios plus4 permission-only races and positive/atomicity cases;490 normal tests pass, strict TypeScript and production build exit0. Owned synthetic schema on isolated15489 only; no real email, production migration or deployment.
- Checkpoint and stop: commit/push this verified slice to phase5; development paused at owner request. Task3 exhaustive direct/indirect inventory and remaining subject/family proofs remain incomplete; Tasks4-7 and final review remain open.


### Batch96 - owner resumption and complete writer inventory (2026-10-02)
- Owner resumed Decision34 with "Implement the plan" after the assessment/reconciliation and authoritative phase5 selection. Isolated branch/worktree starts atd45ad0c; original dirty Phase5-RedTeam is preserved. Native implementer; independent final review retained.
- Complete direct/indirect SQL writer inventory classifies39 production paths and fails uncategorized/stale entries. Membership insertion checks current same-tenant account/company before writes; disabled insertion regression RED toGREEN. Last eligible Central IT and actual distinct Manager continuity retained. Notification enqueue rechecks effective recipients.
- Real default writer322 assertions, subjects57/eight waits, primitive33, identity32, member13 and notification40. Inventory is application-bound; unrestricted owner SQL and unsupported duties remain explicit constraints. Final whole-range ticket corrections are recorded in Batch100 before Task3 closure.

### Batch97 - separate scoped offboarding and durable review (2026-10-02)
- Project access and tenant account preview/commands are separate, with bounded25-row snapshot paging, deterministic blocker/continuity evidence, current authority before replay, no self-disable and no hidden cleanup.
- EXCLUSIVE tenant barrier atomically changes access/session version and appends immutable lifecycle evidence, exact command ledger and eligible Central IT review/outbox. Same person is deduplicated; no Central IT is reported truthfully. Local access disable never implicitly disables the tenant.
- Review resolution supports reasoned NO_FURTHER_ACTION or linkage to a separately confirmed same-subject tenant event. Administrative worker has bounded claims, two-minute lease,8 attempts/backoff and current recipient recheck. External delivery is at least once; fake-provider tests only.
- PostgreSQL commands76, policy44 plus repeated schema28, blockers9 live-family checks and archived retention; rollback injection covers effects/ledger and commit-before-persistence failure. Feature checkpoint2b1ec3d includes Tasks3-6; final acceptance/review follows.

### Batch98 - project administrative parity (2026-10-02)
- Project Admin now administers bounded members, whitelist/archive, independent admin grants, explicit project company registration/association, applicable template/configuration selection and partitioned diagnostics. Operational role is preserved; local discovery does not imply project creation powers.
- Tenant roles/project creation/shared company or template mutation remain Central IT. Existing associated-company/member evidence bounds local invitation/configuration choices. Archived ordinary mutations refuse.
- Actual department Manager/Lead delegation uses nullable operational context; independent administration and Central IT without local membership retain their distinct branches. Administration56/schema28, capabilities29 and member atomicity13 pass.

### Batch99 - scope-clear controls and recovery (2026-10-02)
- Local and tenant controls display distinct scope/evidence, blocker totals, reason and confirmation; durable review navigation supports a separately confirmed global command. Combined operational/admin navigation remains actual-role-aware.
- Immutable key/body survive lost responses; all409 outcomes latch until deliberate reload. Per-mounted useId owners plus synchronous shared guards prevent same-person sibling/nested command collisions. Archived previews remain available; reload works after initial preview failure; success heading receives focus and replay is labeled historical.
- Impeccable direction contract, one detector pass, independent finish review and documenter complete. Four valid desktop/mobile captures; shared brand files preserved and pre-existing greeting/phone-panel documentation drift recorded. No unrelated redesign.

### Batch100 - integrated acceptance, whole-range corrections and bounded closure (2026-10-02)
- Independent source review covered approved92e5b45 throughd45ad0c plus this implementation. It found action-authority bypass on completed ticket replay and retained subcontractor field-role eligibility; both reproduced RED and fixed.16 keyed actions lock the ticket, resolve/check visibility after waiting, then current action authority before replay; historical transition effects are not rerun. Current different captured reviewer denies; cleared reviewer accepts only current qualifying role plus exact actor successful completed marker, with ledger hash checked before response.
- Review additionally corrected survey-cancel role parity, uppercase UUID compatibility and the post-ticket-lock visibility race. Real PostgreSQL replay16, company eligibility13 and observed two-client SHARED reassignment/wait5 pass;48 supplementary unit cases raise total to544. Final reviewer: ship at reviewed source/UI scope, no remaining material source findings; no test execution or secret access by reviewer.
- Final fresh verification:544/544 normal tests, nonincremental TypeScript, locked Docker Linux Node22.23.3/Next15.5.27 production build/audit gate, all named PG suites and nine incumbent regressions. Synthetic cross-actor winner session normalized for deterministic downstream fixture; production unchanged. Full55/55 suite-backed A/P groups at source/migration SHA256655fe0141ab6518e9fa86bfebff12d3d391e6a5f8906259065108b093509189b.
- Production Linux HTTP52 and browser24 pass against fresh two-tenant owned schema/loopback3114. Actual production upload/download compares file bytes SHA256 before/after local+tenant disablement; legacy attachment metadata alone is not physical-byte proof. Browser recovery, scoped confirmations, mounted-owner exclusion and mobile overflow pass; fresh1440x1000/390x844 captures.
- Task3 and Tasks4-7 close at bounded local acceptance scope. Completion/acceptance audit, PRODUCT, Decision36, plan execution reconciliation and release runbook record actual behavior, migration/backup, all-process rollout, worker recovery and access-aware rollback. Proposed exact RED filenames/commands were consolidated; no fabricated RED chronology. Pilot/Owner/Rollout concerns remain separate; no production/Sabine migration/deployment, real message transport or remote full-regression CI green claimed. Ordinary phase5 checkpoint push/fetch follows. Only task-owned fixtures/runtime are cleaned up.
- Cleanup verified: owned Linux container removed; current acceptance and earlier manually retained owned regression schemas dropped through exact-prefix/15489 guards. Local environment/token fixture files removed; sanitized logs and captures remain ignored. GitHub CLI is unavailable, so no remote workflow conclusion is asserted.


### 2026-10-02 - Batch 101 - isolated customer lifecycle rehearsal, first wave
- Intent: execute owner's synthetic first-customer rehearsal and prepare personal role walkthroughs. Role: rehearsal auditor/support harness author; cross-module support scope explicitly authorized.
- Baseline: verified local/remote phase5 6becd3b, clean reused worktree, new codex/customer-lifecycle-rehearsal branch. 544 unit tests and strict TypeScript pass before support changes.
- Files: scripts/rehearsal/customer-lifecycle.mjs, scripts/rehearsal/browser-onboarding.mjs, audits/customer-lifecycle-rehearsal evidence/runbook, decision log. No production source/migrations changed.
- Environment: two uniquely owned schemas in local isolated database15489; separate loopback Linux runtimes3115/3116. Real password logins. Credentials remain ignored; human project remains uncreated for owner walkthrough.
- Evidence: 19 initial HTTP checks,18 expected outcomes,1 unexpected500 for malformed invitation token; real browser login/admin landing captured. Initial harness attempt omitted company association and stopped; corrected support script uses application API, evidence preserved.
- Findings: controlled bootstrap/first-admin invitation absent, required Tenant ID and displayed identifiers, existing-account invitation registration409, malformed token500, wrong-account browser continuation still to assess, organizational closure distinct from person disable. Recommendations UNAPPROVED; no fixes performed.
- Exact restart: owner human session1 login/project creation per rehearsal README; continue remaining R03-R14 automation and role walkthroughs, capture findings before proposing changes. Entire rehearsal is IN PROGRESS, not accepted or release-ready.


### 2026-10-02 - Batch 102 - human rehearsal member onboarding observation
- Owner confirms project creation/opening; member enrollment blocked at empty existing-account selector. Recorded screenshot and F08 in customer-lifecycle rehearsal record.
- Inspected candidate query: existing active tenant accounts, associated project company, no existing membership. Form does not provision missing people. Existing company association also exposes Company ID.
- Captured bulk invitation/domain enrollment suggestions as pending review; project scope and verified email ownership remain explicit design questions. No product changes, database changes, messages, or tests performed (documentation-only observation).


### 2026-10-02 - Batch 103 - project-specific enrollment decision
- Recorded owner selection of project-specific access in Decision38 and rehearsal record. Bulk/domain mechanism remains pending; no inferred implementation authorization.
- Documentation only; no production/data changes or tests.


### 2026-10-02 - Batch 104 - administrator-approved project access requests
- Recorded owner selection in Decision39 and customer rehearsal record; invitation-only recommendation was not selected. Pending requests confer no project access.
- Project discovery and approval routing remain pending. Documentation only; no product/data changes or tests.


### 2026-10-02 - Batch 105 - project link/code enrollment entry
- Recorded owner selection in Decision40 and rehearsal record. Project-specific access requests remain subject to administrator approval; tenant directory was not selected.
- Documentation only; no product/data changes or tests.


### 2026-10-02 - Batch 106 - access-request approval model accepted
- Recorded Decision41 and consolidated project link/code, verified request, scoped admin approval and Requester-default policy in rehearsal record.
- No product/data changes or tests; implementation remains unapproved. Current human onboarding blocker remains recorded.


### 2026-10-02 - Batch 107 - clarify delegated Project Admin persona
- Recorded owner correction to Alex/Jordan journey, fixed cast documentation and retained isolation fixture distinction. Desired privileged invitation and email journey remains a gap.
- Custom role creation versus fixed capability assignment pending clarification; enrollment lists remain project-scoped under previous decisions. Documentation only; no product/data changes or tests.


### 2026-10-02 - Batch 108 - predefined role decision
- Recorded Decision43 and resolved custom-role ambiguity in rehearsal record. Existing Project Admin and Survey Manager assignments use predefined authority; individual permission configuration deferred.
- Documentation only; no product/data changes or tests.


### 2026-10-02 - Batch 109 - automated assisted Alex/Jordan delegation
- Owner authorized simulation without personal participation. Two isolated browser contexts, real registration/login, local synthetic mailbox; no external email or virtual-machine requirement.
- New scripts/rehearsal/jordan-delegation.mjs and sanitized evidence:10 passing expectations. Current GC/admin invitation rejected400; fixture GC Requester invite bridges gap; Alex grants independent administration through actual UI. Jordan opens Northbank, cannot create projects (UI/API403), has no tenant/Survey authority.
- Human fixture now retains Jordan for Northbank SETUP; foreign isolation-control admin unchanged. Secrets/token/password stay ignored. No production changes; whole rehearsal still incomplete.


### 2026-10-02 - Batch 110 - sustained synthetic operation and expansion
- Owner authorized64 Survey staff/100 requesters, Jordan departure and500 internal+50 individual subcontractor expansion. Reused isolated customer schema/production HTTP APIs with synthetic accounts and separate password sessions. Internal identity bootstrap explicitly assisted; no external email, production data or authorization bypass. Baseline544 normal tests and strict TypeScript passed.
- Established15 four-person crews/3 fronts, completed20 initial shifts, then6 surge/4 recovery shifts with650 requesters. Wrong-role/stale-IM driver mistakes were corrected using proper actors/fresh state, with prior attempts retained. Jordan replaced by Casey using actual Central IT commands; project/tenant disables separately confirmed and history retained.

### 2026-10-02 - Batch 111 - guarded Survey Manager succession
- Owner added firing/promotion, then explicitly approved guarded handover after409/400 promotion gap and LAST_SURVEY_MANAGER blocker. Added one current-admin Tenancy command on editable FULL project: fresh preview, three selected subjects, explicit coverage/reporting transfer, protected blockers, EXCLUSIVE barrier, current authority before replay, session bumps and atomic project.role_changed administrative evidence. No migration or historical ticket rewrite.
- Actual UI promoted Taylor; Morgan assumed five crews/Structures. Old affected sessions401; Sam separately project-disabled and tenant-disabled by Central IT. Six live guardrail checks (including full audit rollback and observed writer wait), four browser checks and nine departure checks passed. Concurrent exact replay single event; authority-loss replay403. Preview binding issue discovered and corrected before effects with explicit regression.
-549 tests and TypeScript pass in final Node22 Linux image; production build passes. UI extension reviewer disposition SHIP and documentation finish complete; existing visual system preserved. Broad role changes and recommendations remain out of scope.

### 2026-10-02 - Batch 112 - Manager-directed fair crew allocation and completion report
- Owner directed Taylor to reorganize disproportionate teams. Existing guarded reporting/Area cleanup, staffing and named-team APIs moved3 intact crews:8 Structures/4 Utilities/3 Civil. Preserved request/event/file/roster/member/history hashes; no balancing product feature. Ran340 further requests plus recovery through logical shift49.
-1598 Northbank requests:1502 completed,44 canceled,7 active,45 drafts;650 requesters and63 active Survey people. New assigned workload busiest-Chief share8.1% versus historical48.1%; all15 crews used. Planned effort and remaining Superintendent12/3 coverage imbalance explicitly qualified.
- Final-image verification713 visibility comparisons,160 file checks, eight zero anomaly counts,53 matching shift KPI comparisons and independent1553-submission/1502-completion UTC activity series. Six-role desktop/mobile navigation has no page/API errors or phone overflow. Ops findings100-entry admin selector and Chief completion controls recorded; not automatically fixed.
- Durable report/evidence: audits/customer-lifecycle-rehearsal/operations/REPORT.md and ledger/JSON/captures. Decisions44-46 record authorization. Resumable state/credentials and runtime backups remain ignored; original dirty checkout/retained production data preserved. Local rehearsal complete, not external pilot authorization.

### 2026-10-02 - Batch 113 - continuity, historical discovery and recovery investigation
- Investigated owner screenshot/attached directive and existing Northbank state. Casey archived the project at Oct2 8:59:53pm Chicago; Taylor's enabled Manager membership and historical access remain. Restored authorized archived-project discovery/history landing without unarchive or historical repair.
- Added requested personnel order/disclosures, filter/sort/paginated selection tables and named per-person batch reviews; admin/candidate APIs now page past100. Exact frozen retries/current authority precede ledger replay; company authority accepts validated optional keys. Protected obligations collapse and archived company-access records remain inspectable.
- Added bounded Manager-only coordinated crew/IM preview/command/UI on existing staffing/team ports: EXCLUSIVE lifecycle barrier, fresh checksum, unresolved Area-changing active-work blockers, reason/confirmation, atomic audit/rollback and unchanged historical assignments. Classified writer in lifecycle inventory; no schema or authority model change.
- New disposable continuity/recovery acceptance30 checks+28 schema assertions. Existing PostgreSQL policy44/commands76/project administration56 plus schema assertions, and separate-client concurrency33 passed. Baseline549/current554 normal tests and strict TypeScript passed; Linux production build passed. Actual local capture verifies single-use/expired/reused/disabled password resets, nonenumeration, password/session invalidation and preserved history.
- Real Taylor/Casey/Chief sessions prove archived history and admin ordering/disclosure/filter/sort/selection; desktop/mobile evidence retained. Initial eleven-table witness unchanged; final ten full tables plus every original ticket-event row/archive/totals preserved. Two file-read passes appended160 normal download audit events;160 actual attachment byte-match/foreign-requester-denial checks passed after reversible local runtime update. Current1598 requests/1502 completed remain intact. No production-data or original dirty-checkout changes.
- Independent UI review requested archive inspection/mutation and symmetric editor ownership corrections; applied as one batch with recapture/review. Owner approved capture-only internal email and recovery contact/dual-officer/Axiom support fallback policy; execution and external delivery remain beta gates (Decisions47-48). Durable A-H report and policy in audits/customer-lifecycle-rehearsal/continuity.


### 2026-10-02 - Batch 114 - manpower panel padding correction
- Owner screenshot showed movement fieldset reset overriding panel padding/border. Separated movement panel class from neutral fieldset reset and removed its redundant internal divider. Standard responsive panel inset restored; shared command ownership unchanged.
- Updated only isolated3116 runtime with predecessor/attachments retained. Production build passed; no test suites run for this styling correction. Actual Taylor read-only browser captures at1625x884 and390x844, collapsed/expanded: movement and Team Management padding match24px desktop/16px phone;1px border and no document overflow. Evidence padding-browser.json and .impeccable/review/manpower-padding.


### 2026-10-02 - Batch 115 - administration annotations and pending restart model
- Corrected visible caption hierarchy, member-selection action placement and explicit offboarding cancellation before execution. Pending/uncertain command cancellation remains blocked; retry evidence unchanged. Company table shows readable type labels and discrete ID references. Reviewer personnel table uses a person-type filter over the full existing authorized inventory, preserving handover confirmation.
- Setup template controls are rendered only in SETUP; restricting their approved Project Admin capability to Central IT is pending owner answer. Archived live configuration forms are hidden, diagnostics/history retained. No API mutation or project-state change.
- Production build/TypeScript passed; no test suites run for annotations.12 actual Casey browser checks passed including caption styling, full-inventory role filtering, selected preview/cancel, archived conditional forms and desktop/mobile overflow. Isolated3116 runtime updated with backup retained; original retained data witness preserved. Impeccable finish review/documentation tracked in scoped brief. Restart alternatives remain proposals (Decision49).


### 2026-10-02 - Batch 116 - system records, appearance and guarded recommissioning
- Owner approved guarded recommissioning and system-wide annotation principles (Decision50). Shared record collections now provide semantic sortable/filterable tables, page/all-matching selection and useful scoped CSV export; existing guarded bulk mutations are retained, Central IT account-disable review and named-team draft selections added. Secondary management/evidence/chart-value sections collapse appropriately. Native navigation/options and charts retain their forms. Loaded-record scope is explicit.
- Personal LIGHT/DARK/SYSTEM Appearance is available to every authenticated account; current Central/Tenant IT alone controls tenant primary/accent colors. Versioned/audited saves retain exact uncertain intent and require reload after definitive stale state. Derived readable actions, status semantics, Roboto and unchanged Axiom artwork are recorded in DESIGN.md and sidecar.
- Migration033 adds appearance and immutable recommissioning-period storage. Central IT may begin archived preparation with named eligible replacement, full prior project state and reason; independent administration/session changes and audit are atomic. Reopening requires fresh retained access/company/work review and Survey/invitation/team/assignment readiness. Disabled access stays disabled; original project identity/history stay intact. Existing authorized reassignment/cancellation can resolve work during preparation; ordinary workflow/activation/template bypasses are gated. Central IT work evidence is identity/status metadata, with distinct draft IDs; actual request access remains authorized separately.
- Root IMPLEMENTER owned the coordinated Identity, Tenancy, Ticket gate, Audit and shared API/UI paths sequentially; this owner-approved cross-module increment is the recorded module-boundary exception. Lifecycle writer manifest reconciled with all new SQL writers/application/route entrypoints. No unrelated original dirty-checkout changes.
- Strict TypeScript and Linux production build passed. No unit/full regression suites added or run. Final actual role browser walkthrough125 checks across8 archetypes, light/dark desktop/mobile; authenticated HTTP recommissioning14 checks; visible recommissioning12 checks. All11 retained record families match the original synthetic schema; complete prior project state retained. Original3116 Northbank remains ARCHIVED, disposable3117 copy ACTIVE. Attachment bytes were not re-exercised in this increment.
- Independent Impeccable review disposition fix: mobile description width, display vocabulary and administrative metadata exposure corrected; scoring then required intact type labels and distinct draft IDs. Final disposition ship covers scored fixes. Detector ran once:0 primary/11 advisory; source-backed approved theme/system changes documented, no ignore rules. Public evidence/report in audits/customer-lifecycle-rehearsal/system-appearance.
- Both isolated runtimes updated with predecessor containers/attachments retained. Migration must precede application; once preparation exists, older runtimes cannot enforce its gate and must not resume against pending preparation. Full concurrency/fault-injection regression, integrated release acceptance, external mail and support recovery beta gates remain open. Restart point: owner review current system UI and then targeted lifecycle/regression/release evidence; no actual reopening or automatic wholesale personnel replacement performed on Northbank.

### 2026-10-03 - Batch 117 - Alpha 1 baseline fixture repair
- Owner authorized repository-wide Alpha1 stabilization on alpha1-audit-hardening from pushed dafa89ea316fcedca3409e49bfe765c70e155405. Original dirty Phase5-RedTeam checkout and retained runtimes preserved; root IMPLEMENTER coordinates cross-module increments sequentially.
- Recorded pre-audit strict types pass,552/554 unit tests,18/23 PostgreSQL suites, normal Docker test-gate failure, separate successful Linux compilation, and zero production dependency advisories before correction.
- Corrected navigation lookup/SQL whitespace assertions, current033 fixture dependencies, and missing soft-deleted-draft column in the synthetic query comparator. Historical031 migration assertions remain. Continuity verification writes ignored current evidence instead of overwriting the prior tracked report.
- Verification:554/554 tests, strict types,23/23 disposable PostgreSQL suites, git diff --check pass. Four rollback-only synthetic50k query comparisons pass with content equality and one current event scan. HTTP/browser acceptance remains a separate final gate. No product behavior changed.

### 2026-10-03 - Batch 118 - Alpha 1 authentication retention and JSON validation
- Bounded durable login keys to existing local-password accounts, canonicalized UUID keys, and pruned inactive records after one day without removing live lockouts. Unknown account responses remain generic; known-account five-attempt policy is preserved.
- Login validates malformed JSON, UUID and empty credentials; appearance/recommissioning share the narrow JSON error adapter. Verification: strict types, 15 focused auth/runtime tests and disposable PostgreSQL lockout/pruning/canonical-key cases pass.


### 2026-10-03 - Batch 119 - Alpha 1 bounded delivery and diagnosable failures
- Webhook delivery aborts after ten seconds and releases unused response bodies. Attachment removal tolerates missing files but reports other filesystem failures. Unexpected API failures emit safe classifications with the public correlation ID, without raw exception/SQL/body content.
- Verification: strict types and actual stalled loopback webhook, owned filesystem failure, safe-log/error adapter regression tests pass. Existing outbox retry semantics remain; external delivery is still a beta gate.


### 2026-10-03 - Batch 120 - Alpha 1 retained event integrity and PostgreSQL gate
- Migration034 refuses inconsistent existing ticket-event ownership, adds composite tenant foreign keys, and enforces immutable event update/delete/truncate behavior without rewriting history. Privileged database owners remain trusted.
- Added current actual-route PostgreSQL regressions for appearance/recommissioning authority before replay, audit rollback, same-key concurrency, stale readiness, preserved history, and login retention. Added guarded loopback runner for 27 suites, using owned schemas and explicit opt-in.
- Verification: all 27 PostgreSQL suites pass; 22 Alpha1 checks include migration repeatability, legacy inconsistency refusal and unchanged retained public-ticket witness. HTTP/browser remains a separate gate.


### 2026-10-03 - Batch 121 - Alpha 1 exact administrative retry
- Team/staffing commands now freeze uncertain intent and require deliberate reload after409. Workforce reload cannot clear an uncertain reassignment. Project creation supplies a frozen optional key; the existing server ledger handles concurrent retries atomically after current Tenant Admin authorization, preserving unkeyed clients.
- Verification: strict types,559/559 tests, four focused creation/frozen-command tests and25 current-route PostgreSQL checks pass. Browser lost-response verification remains a final gate.


### 2026-10-03 - Batch 122 - preserve worker attribution while enforcing retained event integrity
- Architecture review identified the established one-configured-service-actor worker contract across tenants. Before deployment, narrowed new034 ownership preflight/FK to the event's ticket tenant; retained the existing actor foreign key. Actor tenant attribution changes are deferred pending a worker contract decision. No retained database was migrated.
- Updated two remaining runtime fixture migration ceilings to current schema. Added actual concurrent project-create replay, mismatch, current-authority and audit rollback checks. All27 PostgreSQL suites pass, including25 Alpha1 checks; legacy inconsistent ticket ownership is refused without rewriting history.


### 2026-10-03 - Batch 123 - confirmed dead symbols and reproducible verification
- Removed compiler-confirmed unused imports, obsolete authority handler/history helper and unused administrative state. Preserved synchronous command-owner/ref guards. Excluded ignored runtime/generated directories from TypeScript and removed tracked incremental cache.
- Added typecheck with unused-symbol checks and test:postgres entry point; Docker/CI now enforce current types, unit tests and PostgreSQL gates. No dependencies upgraded or new lint tool installed.
- Verification: unused-symbol/strict type check passes,559 unit tests and27 PostgreSQL suites pass. Production/development dependency audit reports zero advisories; CI execution remains unobserved until remote run.


### 2026-10-03 - Batch 124 - current repository guidance and audit corrections
- Added concise root entry points and corrected current setup, precedence, testing, fixed-role/grant, recovery and recommissioning guidance. Removed obsolete first-task instructions and fictional Jest/global-reset fixture guidance. Strengthened generated/environment ignore patterns and documented034 preflight/worker retention/webhook limits.
- Corrections to Batch123: incremental TypeScript cache was already untracked/ignored, so no tracked cache removal occurred. Full dependency metadata initially hid an advisory body: production is clear, but full audit identifies one Low tsx-to-esbuild Windows development-server advisory. This repository does not invoke esbuild serve; patch upgrade is deferred and documented, not claimed fixed.
- Verification: documented typecheck/test/guarded PostgreSQL and pinned Docker commands run successfully. Remote CI execution is unobserved. No operational beta approval inferred.


### 2026-10-03 - Batch 125 - current production browser acceptance
- Updated existing acceptance selectors for current table/collapsible semantics; refreshed inventory after owned fixture insertion and asserted preserved archived access. Captures now write ignored audit output instead of overwriting historical review images.
- Added real commit-then-lost-response browser tests for project creation, teams, staffing and workforce; exact body/key retries, frozen fields/reload, stale creation latch and single side effects are verified.
- Verification:52 production HTTP checks,24 existing production browser checks,26 new Alpha1 browser checks and55/55 named matrix cases pass against current source digest f8c182fba02d9cdd886bfa616ca971ef64abd400c84ca737e788503827b34660. Retained customer runtimes/data untouched.


### 2026-10-03 - Batch 126 - cold-start PostgreSQL independence
- Fresh Linux PostgreSQL exposed a draft migration-test assumption that public tickets already existed. Added one synthetic incumbent only in the verified temporary ticket clone, retaining the public-copy preservation check and avoiding any production change.
- Verification: all migrations001–034 and27 PostgreSQL suites pass on an empty fresh PostgreSQL15 container under pinned Linux Node22.23.3; the container and its private environment files were removed. Existing retained-witness27-suite run also passes. Strict/unused types and559 tests pass.


### 2026-10-03 - Batch 127 - Alpha 1 final audit and release evidence
- Durable audits/alpha1 report,24-entry register and sanitized structured evidence distinguish fixed engineering findings, one Medium baseline security vulnerability, accepted performance, deferred hosted/tooling risks and open product decisions. Canonical scan manifest/six artifact hashes verified; coverage is453 fully reviewed tracked paths with391 explicitly not fully security audited. Derived structural review concludes local remediation preferred.
- Final verification:559/559 unit tests; strict/unused types; pinned Linux Docker build;27/27 PostgreSQL suites on retained-witness and cold empty database runs;25 Alpha1 actual-route checks;52 production HTTP;24 existing plus26 new production browser checks;55/55 named cases at source/migration digest f8c182fba02d9cdd886bfa616ca971ef64abd400c84ca737e788503827b34660. Four synthetic50k content/plan comparisons pass with no production SQL change. Production dependency audit zero; full audit one deferred Low development advisory; lint not configured; remote CI unobserved.
- Changed-file private credential check and local documentation links pass. Audit-owned HTTP runtime/attachment volume/schema and cold containers removed; empty schema left by a development test failure removed after proving every table empty. Original dirty checkout and retained Northbank/other runtimes preserved. Push/clean state confirmed in final delivery.


### 2026-10-03 - Batch 128 - checkpoint: role-aware sidebar and Home
- Owner-authorized presentation scope on alpha1-ui-redesign, based on latest alpha1-audit-hardening b8ff814. Replaced project tabs/bottom tabs with a reusable 224px sidebar, current capability/state context and native mobile drawer. Added bounded server-scoped Home composition for Requester, Manager, Superintendent and field roles; independent administration remains additive. Existing routes, workflow/security modules, schemas, Axiom identity and semantic appearance remain.
- Reused Card, StatusBadge, AdministrationRecords, KpiChart and scoped KPI explorers. Added compact table controls/overflow detection and validated requester/crew drill-down filters. Dates/count scope are explicit; Area workload and linked crews remain separate. Non-Manager combined administrators retain existing analytics restrictions and use authorized list counts.
- Verification at source/migration digest 488a8280cc38a79cbc81ab8783e4e48483aae76bb9de1bce70bec8925590df88: strict/unused types; 566/566 unit/route tests; pinned Node22.23.3 production Docker build; 27 PostgreSQL suites; 52 HTTP, 24 lifecycle browser, 26 Alpha1 lost-response checks; 55/55 named cases; 505 UI browser/HTTP checks across 36 role/theme/viewport combinations plus System/tablet, tenant-color and setup captures. Fresh owned PostgreSQL15 schemas/runtime/attachment volumes only. Loopback host15492 replaces occupied15489 solely in ignored test adapters; in-container PostgreSQL runner retains its original guard. Baseline559 tests/strict types/pinned build were recorded before changes.
- Independent finish review required two correction batches: selected/dark planned text contrast, readable dates/reference/gutters, square navigation and accurate combined-Superintendent copy. Final verdict scores all named corrections resolved; it is not an exhaustive security/product approval. Existing Alpha1 findings and open decisions remain in audits/alpha1/REPORT.md.
- Checkpoint is coherent and verified. Latest owner steering requests regular Git checkpoints and consolidation of the redundant top-right project menu into left navigation; that follow-up is next. Final design-system documentation is being reconciled with the approved shell direction. No deployment/push or operational beta approval inferred.
### 2026-10-03 - Batch 129 - checkpoint: consolidate project account navigation
- Owner steering removes the redundant top-right Menu on project routes. Left sidebar/native drawer now includes Appearance, Profile, Assignment Details, Switch project and Sign out; profile/assignment links retain their project query context. Non-project pages without a sidebar retain their existing account overlay. Shared AccountSignOut preserves the existing logout/session API, disabled pending state, failure alert/retry and login redirect.
- Strict types and pinned Node22.23.3 builder gates pass (566/566 tests and production build). Actual production UI acceptance passes688checks over36role/theme/viewport combinations, including no duplicate Menu, account context, Profile navigation and actual logout failure/retry.43 current captures include the project mobile drawer and standalone account overlay. All27PostgreSQL suites,52HTTP,24lifecycle browser,26lost-response browser and55/55 named cases pass at source/migration digest c39437b039b49a24ae35bd2c4febbdb2ab259fa1fbd52df5fd0ac2c6b6335011 using fresh owned fixtures/volumes.
- Second implementation checkpoint follows285b6ce. Current design docs are being reconciled and a fresh independent finish review covers the new account consolidation. This checkpoint does not claim that pending handoff complete. Original hardening branch and retained customer runtimes/data remain untouched.
### 2026-10-03 - Batch 130 - final UI redesign handoff
- Fresh independent finish reviewer opened43valid production captures and returned ship for captured shell/Home/account navigation, with no material UI fixes. This is a visual/navigation verdict at that scope, not an exhaustive security or release approval. Updated PRODUCT's old blanket overlay rule to the owner-approved project sidebar exception; DESIGN.md, token-bearing .impeccable/design.json and surface contract agree with current source.
- docs/ALPHA1_UI_REDESIGN.md maps the brief to actual implementation and verification. Sanitized audits/alpha1-ui-redesign/evidence.json retains exact source digest, successful suite metadata, role/theme/viewport matrix and43capture hashes. Generated logs/captures and private synthetic manifests remain ignored. Documentation links and sidecar JSON resolve; staged documentation diff check passes. No domain, API handler, migration, dependency or lockfile changes.
- Final gates are those in Batch129 at c39437b039b49a24ae35bd2c4febbdb2ab259fa1fbd52df5fd0ac2c6b6335011:566 unit/route tests, strict/unused types, pinned production build,27PostgreSQL suites,52HTTP,24lifecycle browser,26lost-response browser,55/55named cases and688UI checks. Redesign-owned containers, their owned PostgreSQL anonymous volume and four named attachment volumes removed after evidence retention; retained customer runtimes/data untouched.
- Existing Alpha1 risks/open authority decisions, combined non-Manager analytics precedence and remote CI/deployment/beta approval remain separately tracked. New branding/permissions/analytics/builders and speculative workflows are deferred. Verified implementation checkpoints285b6ce/dc77039 and this final documentation checkpoint remain on alpha1-ui-redesign; alpha1-audit-hardening SHA remains b8ff81494c6701bb7f84550b40c247f4588b28cb. No required UI goal work remains.
### 2026-10-03 - Batch 131 - checkpoint: universal left workspace from owner annotations
- Latest owner annotations supersede the project-only sidebar exception. AccountShell now owns one full-width workspace across authenticated routes; the 224px desktop sidebar starts at the frame edge and account/project pages share the existing native mobile drawer. Removed the remaining top-right Menu. Last successfully authorized project is remembered per tab and rechecked by the existing capabilities/inventory APIs; destination APIs still authorize every action. Loading/failure leaves account navigation and logout available while project content waits for current access.
- Appearance has an explicit Back link carrying the prior authenticated route, plus persistent Home. Appearance/Profile/Assignment Details/Projects links retain project context; direct account URLs can recover verified selected context. Logout clears remembered selection only after successful server logout. Status bubbles stay on one line in wider contained Home tables. Recorded chart tables are bounded scroll regions with sticky headings and single-line icon/label review actions; filter/export/paging remain outside the scroll viewport.
- Baseline566 unit tests and strict types passed before edits. Current production Docker build under pinned Node22.23.3 includes strict/unused types,566 passing tests and production dependency audit. Real PostgreSQL27-suite regression,52 production HTTP and24 lifecycle browser checks pass in newly owned disposable schemas separate from the live demo. The comprehensive annotated role/theme/viewport acceptance and independent finish review/documentation are in progress; this checkpoint does not claim final UI completion. No domain/API/migration/dependency/lockfile changes or retained customer state changes.
### 2026-10-03 - Batch 132 - annotation completion and final checkpoint
- Implements all nine owner browser annotations on the universal authenticated workspace. Independent full finish review passed navigation/account changes and required one bounded P1 table correction: the action cell's1% width inflated the nowrap table to18,350px. Removed that percentage constraint; chart tables now use a560px normal minimum and compact type. Category/count/44px review action fit together on desktop; mobile keeps bounded horizontal scroll,22rem vertical scroll and sticky headings. Added browser assertions for actual action visibility, reasonable width, vertical sticky behavior and existing scoped status-list drill-down.
- Final repeated gates at source/migration digest9b9ad61fe8524d00a5a12ca439049c3d168ca11f32ce4ceea4fac0d89eeebe71: strict/unused TypeScript,566 unit/route tests, pinned Node22.23.3 production build and dependency audit,27 PostgreSQL suites,52 actual production HTTP checks,24 lifecycle browser checks,26 lost-response browser checks and55/55 named cases. Annotation acceptance568checks/70current captures covers9role combinations xLIGHT/DARK x1864/390, requester account destinations and Back, context restoration, access-failure escapes, fresh generic navigation and chart initial/actions/sticky views. Invalid scroll-composited/full-page-modal or transient captures were replaced with valid settled evidence.
- Independent confirmation opened12current initial/action/sticky viewport images and scored the listed P1 resolved, with ship limited to that correction. Full review and confirmation are scoped visual findings, not all-route/security/release approval. Documenter reconciled DESIGN.md,PRODUCT.md,token-bearing .impeccable/design.json,surface contract anddocs/ALPHA1_UI_REDESIGN.md to current authorized dimensions/navigation. New sanitized annotations-evidence.json retains exact currentdigest/gates/capture hashes; prior evidence.json remains historical and unchanged.
- Checkpoints0487dcc and this final correction/test/documentation checkpoint follow the owner's regular-checkpoint instruction. The existing owned demo at loopback3124 is refreshed and verified in the in-app browser, preserving its schema, data, attachment volume and current account appearance. Two owned verification applications and their named attachment volumes removed; isolated synthetic verification schemas remain in the task-owned database for reproducibility. Retained customer runtimes/data, original hardening branch, domain/APIs/migrations/dependencies/lockfile unchanged. No push/deployment/operational beta approval inferred.
### 2026-10-03 - Batch 133 - checkpoint: title case and heading help
- Owner follow-up approves title case across headings and moving explanatory subtext into a hoverable question mark beside its heading. Shared HeadingHelp/HelpHint now handles Card descriptions, Home section/count context, request-list guidance, account explanations, chart scope and native administration introductions. Hover, focus and tap expose preserved wording in a native top-layer popover; Escape/outside dismissal and 44px targets work without activating neighboring navigation. Data, alerts, validation, loading/empty states and confirmation facts stay visible. Static headings/captions and internal metric labels use title case; supplied human/project/team names are preserved.
- UI scope crosses presentation components/pages only. No module/API/schema/dependency changes. Strict types, 566 tests and the pinned Node22.23.3 production build pass. All27 PostgreSQL suites,52HTTP,24lifecycle browser,26lost-response browser and55/55named cases pass at source/migration digest 9f0ebcb68b50373251fd85c95a782199ec742cef401797372df77416cb290745. New heading-help browser acceptance passes166checks and records36 captures at1864/390 in light/dark, plus supervisory/admin Home.
- New disposable schemas were created for this batch; ownership/readback guards prove they differ from retained demo data. Automatic approval initially rejected fixture enrichment until exact fresh schema/search_path proof and a one-run guard were supplied; the proven fresh fixture then ran. The live demo has not yet been refreshed. Regular implementation checkpoint precedes independent finish review and documentation; this entry does not claim those handoffs complete. Original hardening branch and retained runtimes/files remain untouched.
### 2026-10-03 - Batch 134 - final: heading capitalization and contextual help
- Independent full finish review opened all36 settled production captures and requested two bounded P2 corrections. Home Recent Requests/Upcoming Need-By Dates/Saved Drafts help now preserves the original sideways-scroll instruction for loaded tables. Linked-Crew help sits4px beside its measured native summary label; a ResizeObserver tracks label geometry, summary activation has its own intrinsic target, and help does not open/close the disclosure. The reviewer scored both named fixes resolved and returned ship for that correction scope, not a new full review or release approval.
- Final exact-source gates pass at d61df200c35a865ea6942b31ac107a234b33d745e2c97dcf6035ab9b39c7c8f9: strict/unused types,566tests, pinned Node22.23.3 production build/dependency audit,27PostgreSQL suites,52HTTP,24lifecycle browser,26lost-response browser,55/55named cases,206heading-help browser assertions and40valid captures. Fresh HTTP fixtures were created after the earlier mutation pass. PostgreSQL and external metadata were combined only after matching source digests; prior audit evidence remains unchanged.
- Independent documenter synchronized token-bearing DESIGN.md and .impeccable/design.json plus PRODUCT, surface contract and docs/ALPHA1_UI_REDESIGN.md within its five-file boundary. Sanitized heading-help-evidence.json records final source/suites/capture hashes and scoped review outcome. The demo web image was refreshed using its proven existing environment/attachment volume, without reseeding; actual in-app browser verifies updated title-case headings, adjacent help, unchangedJamieMorgan/Northbankproject, existing request counts and light mode. Existing database/settings/files remain preserved.
- Checkpoints13ada0e and this final handoff remain on alpha1-ui-redesign. No API/domain/migration/dependency/lockfile changes, push, remote CI, deployment or operational beta approval are inferred. Original hardening branch remains b8ff81494c6701bb7f84550b40c247f4588b28cb. Existing Alpha1 issues/authority decisions and other-browser/screen-reader/every-admin-editor coverage remain separately tracked; captured UI refinement work is complete.
### 2026-10-03 - Batch 135 - checkpoint: comparable Survey and Viewer presentation
- Owner follow-up extends the approved heading/help/table treatment to Survey Command, named Survey Teams and Viewer Project Review. Existing scoped workflows, tab behavior, filter/drill-down semantics and administrative coexistence remain unchanged. Current-status, activity-window, distribution, filter and chart instructions now use the shared adjacent help controls. Viewer chart records use bounded sticky scroll regions and single-line icon actions; reviewed requests use the shared status bubble. Survey Operations uses existing semantic theme colors.
- Baseline strict/unused types and566 tests passed before edits. Pinned Node22.23.3 production build includes strict types,566 passing tests and dependency audit. The first batched browser inspection found mobile queue-select intrinsic width and older detail negative-margin overflow; one correction batch fixes both. Final role/theme/viewport acceptance passes672 checks with64 valid captures covering Manager, Superintendent, Chief, plain Viewer and Viewer with an independent Admin grant inLight/Dark at1864/390. PostgreSQL27 passes at final source1097b4af93d5c71ca6a21f6b5538affbb128aa9df658b710ccbaf5e3475c8a6b. HTTP52/lifecycle24/lost-response26 passed before the final CSS-only correction; current-source refresh and independent review/documentation remain in progress.
- Presentation changes span shared UI and Survey/Review pages under existing authorized cross-surface scope. No domain/API/migration/dependency/lockfile changes. Newly owned visual and mutation schemas are explicitly distinct from the retained demo; no demo reseeding, settings changes or retained runtime removal. Regular implementation checkpoint precedes finish handoffs and does not claim completion or release approval.
### 2026-10-03 - Batch 136 - final: Survey and Viewer refinement
- Independent full finish review opened all64 original captures and required three P2 corrections. Viewer detail navigation now returns to All Requests using the existing authenticated operational role and omits requester Drafts links; field roles return to Crew Work. Crew Work action groups preserve compact rows and single-line labels inside the existing horizontal table scroll. Shared planned-status labels use existing primary ink in Light/Dark. The same reviewer opened18 requested recaptures, scored all three resolved and returned ship limited to those corrections and that packet. Four additional final Crew Work action captures do not enlarge the independent verdict.
- Final gates pass at source/migration digest 2ff3a0f9acea173dd1f16e07848128624b70813115ccccbc43f254363790d19a: strict/unused TypeScript,566 unit/route tests, pinned Node22.23.3/pnpm11.19.0 production build and dependency audit,27 PostgreSQL suites,52 actual production HTTP checks,24 lifecycle browser checks,26 lost-response browser checks and55/55 named acceptance cases. Survey/Viewer acceptance passes716 assertions with68 valid PNG captures across Manager, Superintendent, Party Chief, plain Viewer and Viewer with independent Project Admin authority inLight/Dark at1864/390. The sanitized survey-viewer-evidence.json binds exact source, gates, capture hashes and scoped finish/documentation outcomes; prior evidence artifacts remain historical and unchanged.
- Independent documenter updated DESIGN.md, .impeccable/design.json, survey-viewer surface brief and docs/ALPHA1_UI_REDESIGN.md. PRODUCT.md, token-bearing frontmatter, sidecar extensions and all component preview HTML/CSS are unchanged. No new raster assets were generated. Existing current-state/activity-window definitions, authorized populations, provenance and distribution limits remain available in adjacent independent help; actual values, warnings and confirmation facts remain visible.
- Live demo3124 refreshed with final reviewed image and its same environment/schema/attachment volume. Read-only before/after row hashes confirm users, account/tenant preferences, requests, events, attachments, projects and teams preserved; actual in-app browser confirms existingJamieMorgan/Northbank counts, savedLight mode, updated headings/help and no Menu. No reseeding or user-account/settings mutation. Two owned disposable verification containers removed; automatic approval review rejected deletion of their test volumes because disposable contents were not independently verified, so both volumes remain intact. Fresh synthetic verification schemas remain reproducible; retained customer runtimes/data are untouched.
- Implementation checkpoint e0ba406 and this final correction/evidence/documentation checkpoint satisfy the requested regular checkpoints on alpha1-ui-redesign. Original hardening branch remains b8ff81494c6701bb7f84550b40c247f4588b28cb. No API/domain/migration/dependency/lockfile changes, push, remote CI, deployment, security or operational release approval inferred. Comparable Survey/Viewer UI work is complete within captured scope.


### 2026-10-03 - Batch 137 - drawer close icon
- Owner annotation replaces the navigation drawer's visible Close text with an authored x-shaped SVG in the existing shared stroke icon family. The square button remains44px, does not shrink beside the project name, and exposes Close navigation to assistive technology. Existing close callback, native dialog, Escape/backdrop behavior and focus return remain. This is a narrow shared presentation change, including account/project drawers.
- Baseline strict/unused TypeScript and566 tests pass. The pinned Node22.23.3 Docker production build reruns strict types and566 passing tests and succeeds. Actual in-app browser verifies the icon-only button and44x44 geometry at797 and390 widths, mouse and Enter dismissal, native Escape and return focus to Project navigation; temporary viewport reset. Proof capture remains ignored. No new test framework or UI-only mirror tests added; PostgreSQL/full acceptance suites are not repeated for this isolated icon/CSS change.
- Demo3124 refreshed using the same retained environment/database/attachment volume. Read-only before/after hashes confirm users, preferences, requests, history, attachments, projects and teams preserved. Regular Git checkpoint saves this completed annotation. No API/domain/schema/dependency changes or push/deployment. Historical verification evidence remains unchanged.
- Existing Alpha1 drawer browser selector updated to its new accessible Close navigation name; no new test cases or changed assertions. Other Close controls retain their own labels.

### 2026-10-03 - Batch 138 - design reference and future Alpha 2 integration
- Owner requests one easily referenced location for all design improvements before committing/pushing, with future integration of continuing alpha1-audit-hardening work for Alpha2. Added docs/design/alpha1/README.md as the reference hub, files.md as a complete clickable inventory and changes.json as a pinned Git manifest. The snapshot records76 net changed files and11 design commits from b8ff81494c6701bb7f84550b40c247f4588b28cb to implementation checkpoint8efbc481198c0051ac0c3f4937cd89d0a4eb31ba, with per-file base/design blob IDs. Reference preparation files are explicitly separate from that immutable snapshot.
- Hub maps PRODUCT, DESIGN/sidecar, surface briefs, implementation notes, all four sanitized evidence artifacts and checkpoint history. Future integration creates a separate branch from latest authoritative hardening, merges complete design history, reconciles authority/navigation/read adapters/shared components and runs combined-source acceptance on new disposable fixtures. It neither freezes hardening at the historical base nor treats previous design receipts as merged-code proof. Raw screenshots/private fixtures remain ignored/local and are explicitly distinguished from portable versioned evidence. Added discovery links in docs/README and ALPHA1_UI_REDESIGN; the latter now describes the already-shipped drawer x icon accurately.
- Read-only Git inspection confirms current local hardening still equals the historical base and no design changes under domain modules, API routes, contracts or db, or to dependencies/lockfile/Dockerfile. Remote state is unverified; no fetch, branch switch, merge, push or Alpha2 initialization. Documentation-only preparation leaves runtime source unchanged. Verification checks every manifest entry against pinned Git trees, all local Markdown targets, JSON structure/protected paths and diff whitespace. Historical CODEX bytes/evidence retained; source/build/browser checks from Batch137 are not rerun or promoted into new integration evidence.


## Batch 139 — Tenant IT and Project Admin Design Extension (2026-10-03)

Intent: Extend the approved Axiom/Roboto authenticated workspace into tenant IT and project administration, with regular checkpoints and the central design hub maintained for eventual integration with continuing hardening work.

Behavior: Added mounted in-page section anchors, a two-column wide Tenant IT account/review workspace with one compact lane, scoped flat administrative grouping and bounded 720px-minimum record tables. Access/state/Admin-grant badges use existing neutral styling without wrapping; row actions remain single-line inside table overflow. Supplemental section introductions use independent question-mark help. Scope, blockers, original evidence, reasons, consent, uncertain responses and confirmation facts remain visible. Tenant IT sidebar discovery uses the existing server canCreateProject inventory signal keyed to the current pathname; it supplies no authority or operational project access. Existing command owners, endpoints, eligibility, closed/setup rules and frozen command body/key retry behavior remain unchanged. Ownership is presentation code under app/components; no module, API, migration or dependency change.

Checkpoints: bc4c806 (central hub), d5c0917 (administrative implementation), c3cb158 (shared badge correction and administrative browser runner). The refreshed hub inventory pins 85 files / 14 commits through c3cb158 from b8ff814; the reference/evidence refresh is listed separately to avoid a self-referential commit hash. No fetch, push, merge or Alpha 2 initialization.

Verification: Baseline strict types and 566 tests passed. Final pinned Node 22.23.3/pnpm 11.19.0 build ran strict/unused types and all 566 tests, production build and dependency audit. All 27 actual PostgreSQL suites, 52 production HTTP checks, 24 lifecycle browser checks, 26 lost-response browser checks and 55/55 named cases pass against final source/migration digest 493d60d7ff28a7dbb3c759971b946578511ee675e9a6130e6d8e63496d43ebbf. The administrative runner passes 18 grouped checks and produces 18 settled, opened captures across Light/Dark at 1864/797/390, Tenant IT without operational membership, Viewer+independent Admin, scalar Admin Setup/Archived, real local blocker/central-review evidence and ungranted Manager API denial. Corrected test harness setup/selectors before final receipts: required appearance idempotency header, hidden mobile sidebar lookup, exact disclosure/help distinction and diagnostics denial (ordinary Manager member reads are authorized). Early synthetic queue setup omitted subject/scope in its confirmed body; corrected through the existing API. These were harness failures, not baseline product defects.

Finish: Fresh independent Impeccable reviewer disposition ship for inspected source and all 18 supplied captures, no material fixes. One detector pass found no primary findings and one fluid h1 type-ramp advisory, accepted within the visual verdict. Documenter created docs/design/alpha1/administration.md, compared source/contracts/evidence, preserved DESIGN.md/sidecar, and reported pre-existing details/summary preview drift without repair. Keyboard/motion/System switching and unshown editors are outside the screenshot verdict. Existing autoprefixer start/end compatibility warnings in Survey Operations/project review styles remain outside this scope. Verification is local, not release/security approval.

Preservation: Used new unique visual and regression schemas and separate task-owned test web/file volumes. Retained demo users, appearance, requests/history/files/projects/memberships/teams matched read-only row digests before and after its web-image refresh; the actual 797px browser retains Jamie's requester Home with 14 open, 2 awaiting review, 11 due soon, 2 completed and 3 drafts. Database/file volumes were not removed. Raw captures/logs/private runtime credentials remain ignored; sanitized administration-evidence.json and the central design index are versioned. Historical CODEX bytes preserved by raw UTF-8 append.


## Batch 140 — Administration Workflow Restoration Checkpoint (2026-10-04)

Owner annotations reject the prior section anchors and missing employee/admin/template creation paths. Current authorization restores these workflows in the approved design and separates each administrative tab into its own route-backed page. Tenant Accounts/reviews are full-width separate pages; shared layouts retain exact editor/command state between sibling tabs. Added employee/member and independent Project Admin creation wizards, readable scrollable fixed-role labels, discoverable company registration and shared template creation. Archived restrictions remain explicit.

Ownership spans presentation plus Identity creation, Tenancy membership/grant orchestration and Audit evidence under current cross-workflow authorization. New scoped employees POST revalidates current authority under EXCLUSIVE lifecycle coordination before idempotency, validates associated tenant/project company and fixed roles, and atomically creates account/membership/optional independent grant/evidence. No public self-registration expansion or new RBAC. Passwords excluded from returned/evidence payloads. Added writer inventory and real PostgreSQL writer race coverage. Shared template POST adds optional idempotency for new UI while preserving existing clients.

Baseline and increment strict types and 566 unit/route tests pass. Pinned Node22.23.3 builder production build passed before final navigation-hook addition; the new employee PostgreSQL suite passes in a newly owned rollback schema. Initial host PostgreSQL attempt used an obsolete private credential and failed authentication before any mutation; verified owned-container networking then passed. Full final-source gates, UI functional/visual acceptance and independent finish/documentation remain in progress. New dedicated fixture differs from retained demo; no existing account/password/role/project/history resets, push, merge or deployment. This checkpoint records progress, not completion. Central reference: docs/design/alpha1/administration-restoration.md.


## Batch 141 — Administration Restoration Verification and Recovery (2026-10-04)

Completed the owner-requested restoration after Batch140. Tenant Accounts, Central IT Reviews and Project Templates use separate padded full-width pages. Project Administration separates Personnel, Project Admins, Companies, Settings, Request Policy, Access and Recovery, and Diagnostics into real sibling routes. Existing/new employee/member, independent Project Admin account, company registration and shared template creation are discoverable guided/reviewed workflows. Fixed operational role labels use title case and native scrolling. Archived ordinary mutations remain restricted; retained history and authorized access removal remain available.

Checkpoints: eb84572 restoration,645ebeb functional/browser verification,66b66ad listed-review corrections. Fresh full finish review rejected two material defects: the command owner excluded Request Policy/Access editors, and shared task notices were hidden on Personnel. Correction lifts one synchronous owner/navigation protection to AdminProjectWorkspace for every mutation editor, retains pending/uncertain/stale intent, permits only its own exact retry or deliberate conflict reload, gives batch instances unique tokens, and moves shared load/error/success notices outside hidden task areas. Optional invitation/request-config retry is compatible with existing callers and revalidates authority/lifecycle state before recorded replay. The invitation ledger stores the record ID, not its bearer token. Writer inventory updated. Ownership crosses presentation, authenticated routes, Identity,Tenancy and Audit under explicit restoration authorization; no migration/dependency/RBAC expansion.

Current-source verification: strict/unused types, 566 unit/route tests and pinned Node 22.23.3/pnpm 11.19.0 production build passed. All 28 actual PostgreSQL suites (23 matrix + 5 additional), 33 restoration HTTP, 52 existing lifecycle HTTP, 24 lifecycle browser, 26 lost-response browser and 55/55 named cases pass. Expanded production-browser acceptance passes 156 checks with 54 settled desktop/mobile Light/Dark captures at 1864/390 plus 797 setup/archived/error states. It verifies actual employee sign-in, existing member addition, Tenant IT Project Admin creation, template/company creation, mounted editor retention, uncertain commands blocking every sibling editor, exact invitation/policy retry, and visible company/admin-grant/whitelist/archive/diagnostics failure recovery. Host/browser selector errors were corrected without weakening assertions; verification used newly owned isolated schemas, never the retained demo.

Final source/migration digest: c55319a99104301b924a71c9604e5752d5c376b1ca853346ea64f02d65c5d18c. One detector pass only: zero primary findings, one existing fluid h1 advisory. Same independent reviewer scored both listed material fixes resolved after source and 54 recapture review; this is a listed-fix verdict, not new whole-surface or release/security approval. Shipped documenter compared the ordinary extension with incumbent Axiom/Roboto world, preserved DESIGN.md/.impeccable/design.json, refreshed the central design hub and exact base→66b66ad inventory, and recorded pre-existing system wording/preview drift without repair. Sanitized source-bound evidence: audits/alpha1-ui-redesign/administration-restoration-evidence.json. Historical evidence and CODEX bytes remain intact. Existing autoprefixer start/end warnings remain outside scope. Dedicated acceptance scripts require explicitly owned synthetic fixtures/private runtime and retained-demo guards; no generic clean-clone fixture framework is claimed.

Retained demo refresh replaced only its web application at 3124 with current verified image. Read-only before/after digests match for users/preferences, requests/events, attachments, projects/memberships/teams. No data/credential/preference/schema/volume reset. Actual browser confirms the active project's separate Personnel page and creation wizard. Archived screenshot restrictions remain intentional; inspect active Northbank Demo project e88c1dcf-e031-447b-9f23-417ff8f11129. Only owned verification web containers stopped; their schemas/file volumes preserved. No fetch, push, merge, branch switch or Alpha 2 initialization. Central integration reference: docs/design/alpha1/README.md and administration-restoration.md.


## Batch 142 — Tenant-wide Custom Role Milestone (2026-10-04)

User role/action audit defines the next scope and clarifies that Tenant Admin creates tenant-wide custom roles while Project Admin assigns them. Vertical means Survey Manager -> Area Superintendent -> Area Party Chief -> Instrument Man via crew/reporting membership. Project Access means granting/removing access. Survey recovery applies to cancelled/rejected submitted requests, returning to Returned for Correction; draft recovery belongs to Tenant/Project Admin. Administrators manage roles/access, survey leaders manage crew structure. These current approvals supersede the affected historical fixed-role and recovery limitations; remaining gaps are being audited, not silently declared repaired.

This milestone implements the previously absent custom-role catalog and Name/Template/Review wizard. Migration035 adds Requester/Viewer template-backed tenant names and nullable membership metadata without rewriting existing data. Tenant Admin-only management is checked in the server layout and authenticated APIs; project administrator assignment pickers use tenant catalog entries. Existing member assignment is limited to Requester/Viewer transitions to preserve survey obligation workflows. Versioned edits propagate across assignments/projects with session renewal; deletion blocks every assignment including historical records. New writers have EXCLUSIVE lifecycle coordination, authority before replay, atomic evidence, and writer-inventory coverage. Ownership spans Tenancy, Identity session renewal, Audit and presentation under explicit wizard authorization.

Strict/unused type checking passes. Domain and PostgreSQL verification, final production/browser gates, full 96-cell/core-capability audit, independent finish/documentation and retained-demo upgrade are in progress. This is a regular implementation checkpoint, not a completion or release receipt. No push, merge, Alpha2 initialization, retained data reset or credential changes. Central reference: docs/design/alpha1/role-access-audit.md. Owner's new administration/helpdesk/diagnostics annotations are queued for the next increment after this checkpoint.


## Batch 143 - Administration annotations and scoped support checkpoint (2026-10-04)

Authorized follow-up annotations now provide a project/member Help Desk with Tenant Admin escalation queue, removed-member restoration, explicit Tenant Admin-only Project Admin creation/grant/revocation, actual Personnel roster, Companies subcontractor access and Project Settings request policy. Existing bookmarks remain compatible. Reviewer handover explains unfinished Area review responsibilities. Administration deep links now server-gate ordinary members.

Support is a new module because project support conversations and measured operational observations are distinct from Survey ticket lifecycle; Tenancy owns access restoration, existing audit owns atomic administrative evidence. Migration036 is additive. Diagnostic observations record authenticated verified project or visible-request metadata, sanitized route/status/duration/correlation and prior state, without bodies/secrets/raw errors. No fabricated historical metrics or end-to-end delivery promises.

Strict/unused types and 584 unit tests pass; actual owned PostgreSQL checks pass 39 support/restoration, 19 custom-role, 21 employee and 57 administration cases plus each helper's 28 migration/lifecycle witnesses. Pinned production builder passes. Full database/HTTP/browser, observation failure/race and independent design finish remain ongoing; this is a checkpoint, not completion or deployment approval. Retained demo runtime/data/preferences/files are unchanged. No reset, push, merge or Alpha2 initialization. Central integration reference: docs/design/alpha1/role-access-audit.md.


## Batch 144 - Role/action audit and final scoped support verification (2026-10-04)

Completed the authorized eight-role,12-action/96-cell source audit and custom-role wizard audit, with endpoint/core-capability maps and prioritized gaps. Owner administration annotations now have scoped Help Desk/escalation, current roster, strict Tenant Admin-only independent administrator assignment, member restoration, separate Companies/Project Settings and measured diagnostics. High general administrator/Superintendent survey-role and cancelled/rejected submitted-request recovery gaps remain explicitly reported; Chief recovery ownership question remains pending. Passing extension checks do not assert all96 workflows implemented.

Fresh Impeccable review found hidden sibling notices; shared context now retains named feedback/source-return links across tabs. Invalid header/logo captures were settled and fully reviewed again. Second material batch fixes existing-account company eligibility/reset and Archived restoration read-only gating while preserving historical inspection. Same reviewer scores both listed fixes resolved, disposition ship at listed-fix scope. Documenter compares source and15 captures, preserves DESIGN/sidecar and historical records, reports pre-existing hierarchy/disclosure/type drift without repair. One detector only; existing advisory preserved.

Strict/unused types,584 units and pinned Node22.23.3/pnpm11.19.0 production build pass. All30 actual PostgreSQL suites pass, including21 custom-role and42 support/restoration cases. Owned final-image acceptance passes67 HTTP,50 browser,15 exact retry/shared-notice and19 eligibility/Archived checks. Telemetry failure and tenant-lock timeout preserve business responses; bounded independent pool prevents indefinite observation waits. Project Admin custom-role assignment counts are scoped to that project; Tenant Admin retains tenant counts. Source/migration digest: 00ab5b59f617d4215143f30d16f9586cf255b5f989496ace4d1f32c935827432. Sanitized receipts: audits/alpha1-ui-redesign/role-access-evidence.json. Raw credentials/captures/logs remain ignored.

Retained demo3124 upgraded with only additive migrations035/036 and verified image, original environment/file volume preserved. Existing row digests match users/preferences, requests/events/attachments, projects/memberships/teams, independent grants, company associations and lifecycle evidence. Actual browser retains Alex Rivera's session and shows new task navigation/measured diagnostics; no fabricated historical baseline. No retained reset/seed/truncate/volume removal, credential changes, push, merge or Alpha2 initialization. Ownership crosses Support observation/conversation, Tenancy restoration/catalog, authenticated route adapters and UI under current authorization. Central integration reference retains immutable historical manifests and maps this functional increment with its migrations/writer guards/tests.


## Batch 145 - Duplicate company-name prevention and local checkpoint (2026-10-04)

Owner asks to block Project Admin duplicate company names and commit all work to this branch. Tenancy project and tenant creation now share a tenant-scoped case/whitespace duplicate check under their existing EXCLUSIVE barriers, before insert and atomic evidence. Company type does not distinguish an existing name; other tenants remain independent; punctuation remains significant. No migration, old-ID merge/deletion or user/request/association rewrite. Existing company ID association remains supported. UI disables known project-name duplicate review, attaches accessible inline feedback, retains input on tenant-only409 and preserves deliberate frozen-command reload. Lifecycle inventory records the existing serialized check/insert contract.

Baseline strict types pass; host unit loopback tests were sandbox-blocked by EACCES, not product failure. Final pinned Node22.23.3/pnpm11.19.0 build passes strict types/all584 units/production build/dependency audit. All30 actual PostgreSQL suites pass; owned production HTTP/browser acceptance passes24 named checks for case/space/tab variants, different type, tenant scope, unchanged records/evidence, exact replay, concurrent project/tenant writers, existing-ID association,1107/390 feedback and409 reload. Corrected the harness's stale-button label from Confirm action to existing Retry same action; no product fix or weakened conflict assertion. Source/migration digest 7e172f87a5adf485fda2ac6853c9c10b4e2f0b35a0750a559b26bba25fe78315. Evidence: audits/alpha1-ui-redesign/company-name-evidence.json. Central reference: docs/design/alpha1/company-name-guard.md.

Narrow independent Impeccable finish disposition ship, no material fixes; three settled captures opened. Changed-target detector once returns[], no new assets or visual tokens. Documenter appends the ordinary extension contract, preserves DESIGN/sidecar/historical evidence and reports existing drift without repair. Retained demo3124 refreshed only the web image with original environment/database/file volume. Before/after digests match company IDs plus retained users/preferences/requests/events/files/projects/memberships/grants/teams/administrative lifecycle evidence. Actual existing Alex Rivera session shows SC Company 1 duplicate feedback and disabled review. No schema/data/credential reset, push, merge or Alpha2 initialization.
