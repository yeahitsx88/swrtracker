# Phase 2 Execution Log

## Milestone Status
WS1  Completed
WS2  Completed
WS3  Completed
WS4  Completed
WS5  Completed
WS6  Completed
WS7  Completed
WS8  Completed
WS9  Completed

## Baseline
Date: 2026-03-04
Validation:
- `pnpm tsc --noEmit` passed.
- `pnpm test` passed with 36 passing tests and 0 failures.
Test Status:
- Green baseline inherited before WS1 work started.
Notes:
- The repository already contains prior Phase 2 foundation work outside this required tracker format.
- Workstream status is intentionally conservative: no workstream is marked Completed until its backlog tasks are satisfied in order and logged below.

## WS1 Task Charters

### WS1-T1
- Task ID: WS1-T1
- Objective: add tenancy-layer AOR assignment contracts and use cases for user-scoped and department-scoped `aor_assignments`, including active-assignment deactivation and reassignment support.
- Acceptance Criteria:
- user-scoped assignment can create a new active `aor_assignments` row for a valid project/AOR node pair.
- department-scoped assignment can create a new active `aor_assignments` row for a valid project/AOR node pair.
- reassignment can deactivate prior active assignments before creating the replacement assignment in the same use case.
- explicit deactivation only affects active assignments in the same tenant/project scope.
- only `PROJECT_ADMIN` or `TENANT_ADMIN` can execute these setup actions.
- File Targets:
- `src/modules/tenancy/application/ports.ts`
- `src/modules/tenancy/infrastructure/tenancy.repository.ts`
- `src/modules/tenancy/application/assign-aor-user.ts`
- `src/modules/tenancy/application/assign-aor-department.ts`
- `tests/tenancy/aor-assignments.test.ts`
- Citations:
- `CLAUDE.md` Section 5 `aor_assignments`
- `CLAUDE.md` Section 21 Setup Ownership note
- `BACKLOG.md` WS1-T1
- Out Of Scope:
- department creation, title catalog, and membership workflows from WS2
- lifecycle gating of setup routes after activation from WS5-T3
- Gate A: Approved on 2026-03-04 by Spec Arbitrator and Change Controller

### WS1-T2
- Task ID: WS1-T2
- Objective: add the project setup API surface for AOR assignments and deactivations, authorized for `PROJECT_ADMIN` and `TENANT_ADMIN`, following the established setup-route patterns.
- Acceptance Criteria:
- route accepts user-scoped and department-scoped assignment requests.
- route supports assignment deactivation without placing business logic in the web layer.
- route resolves setup authorization through tenant/project role lookup and rejects non-setup actors.
- route tests cover at least one successful assignment path and one successful deactivation path.
- File Targets:
- `src/app/api/projects/[projectId]/aor/assignments/route.ts`
- `src/app/api/projects/[projectId]/aor/route.ts`
- `tests/tenancy/aor-assignment-route.test.ts`
- Citations:
- `CLAUDE.md` Section 3 Architecture
- `CLAUDE.md` Section 21 Setup Ownership
- `BACKLOG.md` WS1-T2
- Out Of Scope:
- retiring legacy `areas` / `subareas` write surfaces from WS6-T2
- setup lifecycle mutability gates from WS5-T3
- Gate A: Approved on 2026-03-04 by Spec Arbitrator and Change Controller

## Resume Notes
- No remaining backlog items. Phase 2 is closed after the WS9-T1 verification and reporting pass.
- Earlier repo-local Phase 2 milestones are preserved in `CODEX.md`; this tracker is the canonical resumability log going forward.

### WS1 Completed
Date: 2026-03-04
Tasks:
- WS1-T1 Add AOR assignment repository contracts and application services for user-scoped and department-scoped `aor_assignments`, including deactivation and reassignment support.
- WS1-T2 Add the project setup API surface for AOR assignments and deactivations, authorized for `PROJECT_ADMIN` and `TENANT_ADMIN`.
Validation:
- `pnpm tsc --noEmit` passed after the WS1 implementation.
- `pnpm test` passed after the WS1 implementation.
Test Status:
- 43 passing tests, 0 failures.
Notes:
- Added tenancy-layer AOR assignment contracts plus dedicated user and department assignment use cases with explicit deactivation helpers.
- Added `POST` and `DELETE` setup routes for AOR assignments, reusing the project setup actor-role resolver from the existing AOR route.
- Added unit coverage for both use cases and route handlers.
- Project lifecycle gating for setup mutations remains deferred to WS5-T3 per the backlog dependency order.

### WS2 Progress
Date: 2026-03-04
Tasks:
- WS2-T1 Add department repository/application support to create and list departments, and auto-seed the canonical manager title into `department_titles` on creation.
Validation:
- `pnpm tsc --noEmit` passed after the WS2-T1 implementation.
- `pnpm test` passed after the WS2-T1 implementation.
Test Status:
- 46 passing tests, 0 failures.
Notes:
- Added tenancy domain types for `Department` and `DepartmentTitle`, plus repository support to save/list departments and seed title-catalog rows.
- Added `createDepartment` and `listDepartments` use cases, keeping the web/API layer deferred to WS2-T2 per backlog order.
- Manager-title seeding currently uses `assignmentLayer = MANAGER` and `defaultPriority = MED_HIGH`, inferred from the Phase 2 priority model for department manager/lead roles.

### WS2 Progress
Date: 2026-03-04
Tasks:
- WS2-T2 Add the department API surface for create/list operations under project setup.
Validation:
- `pnpm tsc --noEmit` passed after the WS2-T2 implementation.
- `pnpm test` passed after the WS2-T2 implementation.
Test Status:
- 49 passing tests, 0 failures.
Notes:
- Added `/api/projects/[projectId]/departments` with `POST` for department creation and `GET` for department listing.
- The route reuses the existing project setup actor-role resolver from the AOR setup surface so setup authorization stays consistent.
- Title-catalog management beyond the seeded manager title remains deferred to WS2-T3.

### WS2 Progress
Date: 2026-03-04
Tasks:
- WS2-T3 Add title-catalog management for departments, including `default_priority` and `assignment_layer` validation.
Validation:
- `pnpm tsc --noEmit` passed after the WS2-T3 implementation.
- `pnpm test` passed after the WS2-T3 implementation.
Test Status:
- 55 passing tests, 0 failures.
Notes:
- Added tenancy application support to upsert and list `department_titles`.
- Added `/api/projects/[projectId]/departments/[departmentId]/titles` with `POST` for upsert and `GET` for list.
- Validation now enforces the Phase 2 title-catalog enums for `defaultPriority` and `assignmentLayer`.

### WS2 Completed
Date: 2026-03-04
Tasks:
- WS2-T4 Add department membership entry, one-department-per-user enforcement, free-agent pool handling, and title assignment workflows including `superintendent_id`.
Validation:
- `pnpm tsc --noEmit` passed after the WS2-T4 implementation.
- `pnpm test` passed after the WS2-T4 implementation.
Test Status:
- 62 passing tests, 0 failures.
Notes:
- Added tenancy support for `department_memberships`, including create, reassignment, and title-assignment updates.
- Added `/api/projects/[projectId]/departments/[departmentId]/members` with `POST` for free-agent pool entry and `PATCH` for title assignment or department reassignment.
- One-department-per-user enforcement now happens in the application layer, matching the Phase 2 rule.
- WS2 is complete; WS3 can now wire ticket submission and visibility onto the department model.

### WS3 Progress
Date: 2026-03-04
Tasks:
- WS3-T1 Wire ticket submission to derive `department_id` and default priority from `department_memberships` and `department_titles`, with manual department fallback when the requester has no membership.
Validation:
- `pnpm tsc --noEmit` passed after the WS3-T1 implementation.
- `pnpm test` passed after the WS3-T1 implementation.
Test Status:
- 65 passing tests, 0 failures.
Notes:
- Ticket drafts now keep `ticketNumber = null` and finalize `department_id`, `priority`, and `ticketNumber` at submission time using `department_memberships`, `department_titles`, and the priority whitelist.
- Requesters with a department membership auto-derive both the department tag and title-based default priority at submit time.
- Requesters without a department membership can now provide `departmentId` at submit time without creating a project membership side effect; drafts may still store a department when preselected.
- `/api/tickets` now derives requester company context server-side and only validates manual department input when one is supplied on draft creation.
- WS3-T2 remains to close the workstream by enforcing department-manager and department-lead visibility resolution in the ticket read path.

### WS3 Completed
Date: 2026-03-04
Tasks:
- WS3-T2 Implement `DEPARTMENT_MANAGER` and `DEPARTMENT_LEAD` visibility resolution, including department-only scope for managers and department-plus-AOR intersection for leads.
Validation:
- `pnpm tsc --noEmit` passed after the WS3-T2 implementation.
- `pnpm test` passed after the WS3-T2 implementation.
Test Status:
- 69 passing tests, 0 failures.
Notes:
- `resolveVisibility` now resolves `departmentId` from `department_memberships` for department-scoped roles and adds AOR scope for `DEPARTMENT_LEAD`.
- Ticket repository reads now enforce `department_id` filtering for `DEPARTMENT_MANAGER` and `department_id + aor_node_id` intersection filtering for `DEPARTMENT_LEAD`.
- Repository coverage now verifies manager department-only filtering, lead department-plus-AOR filtering, and the no-AOR/no-visibility guard for leads.
- WS3 is complete; WS4 can now add the direct-assignment creation path on top of the department-tagged submission model.

### WS4 Progress
Date: 2026-03-04
Tasks:
- WS4-T1 Add the direct-assignment creation use case so Variant 2 enters at `ASSIGNED`, stores immediate crew assignment context, and does not reuse requester draft semantics.
Validation:
- `pnpm tsc --noEmit` passed after the WS4-T1 implementation.
- `pnpm test` passed after the WS4-T1 implementation.
Test Status:
- 73 passing tests, 0 failures.
Notes:
- Added a dedicated direct-assignment creation use case that creates Variant 2 tickets directly in `ASSIGNED`, allocates the ticket number immediately, and stamps crew assignment context on insert.
- The direct-assignment path derives department tagging and default priority from the requester membership/title data, with manual department fallback and whitelist override on the initial create operation.
- `/api/tickets` now has a Variant 2 branch for `SURVEY_MANAGER` and `SURVEY_SUPERINTENDENT`, requiring `requesterId` and `assignedPartyChiefId` instead of reusing the requester draft creation path.
- WS4-T2 remains to close the workstream by aligning the existing assignment, field-status, and cancellation APIs with direct-assignment tickets.

### WS4 Completed
Date: 2026-03-04
Tasks:
- WS4-T2 Align Variant 2 authorization and transition handling across assignment, start, PC approval, delay, and cancellation paths so direct-assignment tickets work end-to-end through the existing API set.
Validation:
- `pnpm tsc --noEmit` passed after the WS4-T2 implementation.
- `pnpm test` passed after the WS4-T2 implementation.
Test Status:
- 74 passing tests, 0 failures.
Notes:
- `assignTicket` now supports active direct-assignment ticket reassignment without forcing an invalid `ASSIGNED -> ASSIGNED` workflow transition, while still using the existing assignment audit event.
- The assign route now passes visibility context through to the use case so reassignment follows the same scoped-read rules as the other ticket mutation routes.
- Workflow coverage now asserts the direct-assignment cancellation and delay-related transition paths that the existing APIs rely on.
- Added a route-level smoke test that exercises create, reassign, start, field-cancel request, and PC approval against a direct-assignment ticket using the real route functions.
- WS4 is complete; WS5 can now enforce project lifecycle gates on top of both standard and direct-assignment ticket flows.

### WS5 Progress
Date: 2026-03-04
Tasks:
- WS5-T1 Add project lifecycle activation logic with the build-aware `SETUP -> ACTIVE` readiness gate and warnings acknowledgement flow.
Validation:
- `pnpm tsc --noEmit` passed after the WS5-T1 implementation.
- `pnpm test` passed after the WS5-T1 implementation.
Test Status:
- 79 passing tests, 0 failures.
Notes:
- Added tenancy lifecycle readiness support so activation can evaluate the exact Phase 2 hard gates and soft warnings from repository-scoped project data.
- Added the `activateProject` use case to enforce `SETUP -> ACTIVE`, including the `FULL` build superintendent AOR-assignment hard gate and the warning acknowledgement flow for missing departments, acting Survey Manager coverage, and allowed domains.
- Added `/api/projects/[projectId]/activate` as the setup lifecycle route, reusing the existing `PROJECT_ADMIN` / `TENANT_ADMIN` setup-role resolver.
- Added regression coverage for hard readiness failures, warning acknowledgement blocking, successful activation metadata stamping, and the route-level blocked response shape.
- WS5-T2 remains to archive active projects and begin enforcing archived-project immutability in the tenancy repository and API surface.

### WS5 Progress
Date: 2026-03-04
Tasks:
- WS5-T2 Add `ACTIVE -> ARCHIVED` transition handling and repository guards for archived project immutability.
Validation:
- `pnpm tsc --noEmit` passed after the WS5-T2 implementation.
- `pnpm test` passed after the WS5-T2 implementation.
Test Status:
- 85 passing tests, 0 failures.
Notes:
- Added the `archiveProject` use case to enforce the `ACTIVE -> ARCHIVED` transition and restrict it to `TENANT_ADMIN`.
- Added `/api/projects/[projectId]/archive` so project archival now has a dedicated lifecycle route distinct from setup mutation surfaces.
- The tenancy repository now blocks project-scoped setup writes once a project is archived, covering AOR changes, department changes, membership changes, whitelist changes, and legacy area/subarea writes.
- Regression coverage now verifies archive authorization, active-state enforcement, archive metadata stamping, route behavior, and a concrete repository immutability guard.
- WS5-T3 remains to propagate lifecycle gates across the ticket APIs and remaining setup routes.

### WS5 Completed
Date: 2026-03-04
Tasks:
- WS5-T3 Enforce lifecycle gates across ticket and setup APIs: no ticket submission in `SETUP`, no mutations in `ARCHIVED`, and no project-setup mutation after activation unless explicitly allowed.
Validation:
- `pnpm tsc --noEmit` passed after the WS5-T3 implementation.
- `pnpm test` passed after the WS5-T3 implementation.
Test Status:
- 94 passing tests, 0 failures.
Notes:
- Ticket lifecycle checks now resolve project status through the ticket repository so requester draft creation rejects archived projects and draft submission rejects both `SETUP` and `ARCHIVED`.
- `/api/tickets` now blocks direct-assignment creation unless the project is `ACTIVE`, while still permitting standard requester drafts outside archived projects.
- Setup mutation routes now share a `SETUP`-only guard, so AOR, department, title-catalog, and department-membership setup writes return conflicts once the project has been activated or archived.
- Added regression coverage for ticket lifecycle guard behavior and setup-route conflict handling after activation.
- WS5 is complete; WS6 can now retire legacy setup surfaces and add the remaining template read/list support.

### WS6 Progress
Date: 2026-03-04
Tasks:
- WS6-T1 Add the tenant-admin template read/list surface with summary fields and usage counts required by the template-management surface.
Validation:
- `pnpm tsc --noEmit` passed after the WS6-T1 implementation.
- `pnpm test` passed after the WS6-T1 implementation.
Test Status:
- 98 passing tests, 0 failures.
Notes:
- Added a tenancy template list query that returns the template-management summary fields required by spec: template name, crew build, AOR depth, AOR-level count, discipline-group count, usage count, and created date.
- Added the `listProjectTemplates` use case with `TENANT_ADMIN` authorization.
- `/api/project-templates` now supports `GET` for the tenant-admin list surface alongside the existing create route.
- Added focused coverage for template list authorization and response shape without taking the optional `project_templates.updated_at` migration, because the spec-defined list surface does not require it.
- WS6-T2 remains to retire the legacy area/subarea write surfaces and align the smoke fixtures with the AOR-native setup model.

### WS6 Completed
Date: 2026-03-04
Tasks:
- WS6-T2 Retire legacy areas / subareas write surfaces and their application helpers after AOR node and assignment APIs are fully in place, and move smoke fixtures off legacy cleanup assumptions.
Validation:
- `pnpm tsc --noEmit` passed after the WS6-T2 implementation.
- `pnpm test` passed after the WS6-T2 implementation.
Test Status:
- 100 passing tests, 0 failures.
Notes:
- The legacy `/api/projects/[projectId]/areas` and `/api/projects/[projectId]/areas/[areaId]/subareas` write routes now return explicit conflicts that direct callers to the AOR setup surface.
- Removed the obsolete `create-area` and `create-subarea` application helpers so legacy area/subarea creation no longer has an application entry point.
- Added repository backstops so direct `saveArea` / `saveSubarea` calls also reject with the same retirement guidance.
- Updated the ticket smoke cleanup to stop deleting legacy `areas` / `subareas`, since smoke data is already seeded through AOR tables.
- WS6 is complete; WS7 can now add attachment support on top of the closed lifecycle and setup surfaces.

### WS7 Completed
Date: 2026-03-04
Tasks:
- WS7-T1 Implement attachment metadata/API support for requester uploads on active tickets, with active-status permission checks, object metadata validation hooks, and audit emission.
Validation:
- `pnpm tsc --noEmit` passed after the WS7-T1 implementation.
- `pnpm test` passed after the WS7-T1 implementation.
Test Status:
- 110 passing tests, 0 failures.
Notes:
- Added attachment metadata validation and persistence support in the attachment module without expanding scope into object transfer orchestration.
- Added `/api/tickets/[ticketId]/attachments` with requester-only upload handling and ticket/project state checks inside the same transaction as the attachment write and audit event.
- Added regression coverage for requester-only permission enforcement, own-ticket enforcement, active-ticket gating, archived-project blocking, route validation failures, and `attachment.uploaded` audit payload contents.
- `attachment.uploaded` was already present in the audit event type union, so no new audit event name was introduced.
- WS7 is complete; WS8 can now add the notification foundation on top of the closed attachment and lifecycle behavior.

### WS8 Completed
Date: 2026-03-04
Tasks:
- WS8-T1 Implement the notification foundation needed for spec-defined Phase 2 operational signals: approver timeout notices and tenant/project-admin daily vacancy notifications.
Validation:
- `pnpm tsc --noEmit` passed after the WS8-T1 implementation.
- `pnpm test` passed after the WS8-T1 implementation.
Test Status:
- 118 passing tests, 0 failures.
Notes:
- Added notification-module use cases for approver timeout dispatch and daily vacancy escalation dispatch, plus repository and transport interfaces for the in-process worker surface.
- Added notification infrastructure queries for overdue `SUBMITTED` tickets and unresolved active `acting_grants`, with recipient resolution for Survey Managers, TENANT_ADMINs, and PROJECT_ADMINs.
- Added the audit event types required for timeout notices: `approver.timeout_warning_sent` and `approver.timeout_unlocked`.
- Timeout dispatch requires the caller to provide an audit actor ID, because `ticket_events.actor_id` is non-null in the current schema and the repo does not yet define a built-in system user.
- WS8 is complete; WS9 can now run the closure verification pass and final Phase 2 reporting.

### WS9 Completed
Date: 2026-03-04
Tasks:
- WS9-T1 Expand verification coverage to the Phase 2 closure set and append milestone logs only after each prior task batch is green.
Validation:
- `pnpm tsc --noEmit` passed for the final Phase 2 closure pass.
- `pnpm test` passed for the final Phase 2 closure pass.
Test Status:
- 118 passing tests, 0 failures.
Notes:
- Re-ran the full validation suite after WS8 so the closure log reflects a green end-state across tenancy, ticket, workflow, attachment, and notification coverage.
- Verified `PHASE2_STATUS.md` now shows WS1 through WS9 as Completed.
- Final closure reporting is recorded in `PHASE2_COMPLETION_REPORT.md`.
- Phase 2 is closed according to the backlog order and the repository-local closure criteria from the execution prompt.
