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
