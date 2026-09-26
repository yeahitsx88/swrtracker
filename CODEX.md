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

### 2026-09-25 - Batch 3
- Intent: remediate the published-checkpoint security audit across dependency, identity, tenancy, ticket visibility, and workflow boundaries.
- Files touched: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `db/migrations/006_security_boundaries.sql`, `src/app/api/auth/register/route.ts`, `src/app/api/companies/`, `src/app/api/projects/`, `src/app/api/tickets/`, `src/lib/`, `src/modules/audit/domain/types.ts`, `src/modules/identity/`, `src/modules/tenancy/`, `src/modules/ticket/`, `src/modules/workflow/domain/transitions.ts`, `tests/`, `audits/2026-09-25-remediation-brief.md`, `CODEX.md`.
- Behavior added: company-bound registration domains and bounded input; tenant-admin authorization for configuration; tenant, project, company, requester, and assignee validation; layered subcontractor visibility; assigned-actor workflow checks; Party Chief approval for Instrument Man completion; current cancellation terminal states; immutable event triggers; tenant audit events for domain and whitelist changes; updated dependency lockfile.
- Verification: `pnpm tsc --noEmit`, `pnpm test` (15 passing), `pnpm build`, and live `pnpm audit --audit-level=low` pass. Migration 006 was reviewed statically but could not be executed locally because no PostgreSQL server is available; Docker Desktop service could not be started in this environment.
- Known gap queued for later batches: execute migration 006 and database integration tests in a PostgreSQL environment; implement project activation/readiness, full current cancellation approval chains, and remaining Phase 2 AOR and crew-build schema. A project created in SETUP cannot yet become ACTIVE through this API. Existing tenant administrators require an operational grant or a migrated legacy membership before using admin routes.
- Production behavior changed: yes.
- Module boundary deviation: the six audit findings crossed Identity, Tenancy, Ticket, Workflow, Audit, API routes, shared library code, and the dependency lockfile; the requested remediation required a coordinated cross-module patch.

### 2026-09-25 - Batch 3 migration verification addendum
- Intent: verify migration 006 against PostgreSQL after Docker became available.
- Files touched: `tests/db/006_upgrade_fixture.sql`, `tests/db/006_post_assertions.sql`, `audits/2026-09-25-remediation-brief.md`, `CODEX.md`.
- Behavior added: disposable legacy-data upgrade fixture and assertions for role conversion, company-domain binding, cross-tenant foreign keys, and append-only event triggers.
- Verification: migrations 001-006 passed on fresh PostgreSQL 15; 001-005 plus legacy fixture, then 006 and post-upgrade assertions passed; a second execution of 006 passed. The disposable container was removed. This supersedes the prior note that migration 006 had only static review.
- Known gap queued for later batches: migration 006 is not applied to `survey-db`; application database integration tests and the remaining spec features listed above are pending.
- Production behavior changed: no additional production code changes in this addendum.

### 2026-09-25 - Batch 4
- Intent: close the remaining migration, database integration, project activation, cancellation approval, AOR/crew-build, and tenant-admin provisioning review gates.
- Files touched: `db/migrations/007_operational_readiness.sql`, `db/migrations/008_ticket_priority.sql`, `db/bootstrap-admin.ts`, `package.json`, `src/modules/tenancy/`, `src/modules/ticket/`, `src/modules/workflow/domain/transitions.ts`, `src/modules/audit/domain/types.ts`, `src/app/api/projects/`, `src/app/api/tickets/`, `src/lib/get-project-config-role.ts`, `tests/db/`, `tests/tenancy/`, `tests/ticket/`, `tests/identity/bootstrap-admin.test.ts`, `audits/2026-09-25-review-gates.md`, `CODEX.md`.
- Behavior added: FULL/MEDIUM/SLIM project activation with readiness and atomic audit; AOR and department configuration; scoped ticket AOR/department creation and title priority; four-level priority schema; field and survey cancellation approval chains with row locking, role checks, reasons, and atomic events; transactional initial tenant-admin bootstrap. Owner-selected role names are `DEPARTMENT_MANAGER` and `DEPARTMENT_LEAD`.
- Verification: local `survey_dev` now tracks migrations 001–008 and had zero customer rows at migration time; migration 008 applied and reran in disposable PostgreSQL 15; database-backed test suite passed 32/32; `pnpm tsc --noEmit`, `pnpm build`, `git diff --check`, and live `pnpm audit --audit-level=low` passed.
- Known gap queued for later batches: outbound notification dispatch, draft numbering at submission, draft recovery, full user lifecycle, role vacancy continuity, department reassignment/removal, and rebuilt application image acceptance testing. See `audits/2026-09-25-review-gates.md`.
- Production behavior changed: yes; the local database schema changed, while the running application image was not rebuilt.
- Module boundary deviation: this review gate required coordinated migration, tenancy, ticket, workflow, audit, identity bootstrap, API, and test changes across module boundaries.

### 2026-09-25 - Batch 5 (Tenancy project templates)
- Intent: complete tenant-scoped project template management and apply a template during SETUP project creation.
- Files touched: `src/modules/tenancy/domain/types.ts`, `src/modules/tenancy/application/ports.ts`, `src/modules/tenancy/application/create-project.ts`, `src/modules/tenancy/application/project-templates.ts`, `src/modules/tenancy/infrastructure/tenancy.repository.ts`, `src/app/api/tenants/templates/route.ts`, `tests/tenancy/templates.test.ts`, `tests/tenancy/aor-operations.test.ts`, `tests/tenancy/continuity.test.ts`, `CODEX.md`.
- Behavior added: TENANT_ADMIN template list/create/update/delete with tenant scoping, referenced-template delete conflict, atomic audit events, and SETUP project creation from a template that copies AOR levels and department names with manager titles.
- Verification: `pnpm tsc --noEmit` passed; targeted template tests passed 5/5 against PostgreSQL. The concurrent full suite had one unrelated Ticket mock failure (`findActiveProjectCrewBuild` missing) while Ticket development was in progress; root is coordinating the final suite.
- Known gap queued for later batches: template-created departments need Project Admin AOR assignment and manager personnel assignment after AOR nodes are populated. The existing project route integration is owned by the root session.
- Production behavior changed: yes.
- Module boundary deviation: one new API route and focused tests accompany the Tenancy module change.

### 2026-09-25 - Batch 5 (Identity invite lifecycle)
- Intent: implement tenant and company bound project invitations with setup delegation and single-use acceptance.
- Files touched: `db/migrations/012_invite_company_binding.sql`, `src/modules/identity/domain/invite.ts`, `src/modules/identity/application/invite-ports.ts`, `src/modules/identity/application/invites.ts`, `src/modules/identity/infrastructure/invite.repository.ts`, `src/modules/identity/infrastructure/user.repository.ts`, `src/app/api/invites/route.ts`, `tests/identity/invites.test.ts`, `CODEX.md`.
- Behavior added: project and company scoped invite creation, paginated listing and history, cancellation, token inspection, expiry audit, and locked single-use acceptance for a matching new or signed-in user. Setup Project Admin delegation ends on activation. Audit payloads never include the token. Migration 012 binds new invites to a tenant company; historical unbound invites require cancellation and reissue.
- Verification: `pnpm tsc --noEmit` and focused tests passed; migrations 001-012, including a second run of 012, passed in disposable PostgreSQL 15; database-backed invite tests passed 8/8 and the disposable container was removed. Migration 012 was not applied to `survey_dev` in this session.
- Known gap queued for later batches: POST returns an invite token to the authorized administrator with `deliveryStatus: PENDING`; SMTP delivery for `invite.sent` tenant events still needs notification-worker integration before invitations are emailed automatically.
- Production behavior changed: yes, after migration 012 is applied.
- Module boundary deviation: one Identity API route and migration 012 accompany the Identity module implementation.

### 2026-09-25 - Batch 5 (Notification invite delivery)
- Intent: deliver company-bound invitations by SMTP from a durable tenant-event outbox without copying bearer tokens into audit records.
- Files touched: `db/migrations/014_invite_notification_outbox.sql`, `src/modules/notification/application/invite-delivery.ts`, `src/modules/notification/infrastructure/invite-delivery.repository.ts`, `src/modules/notification/worker.ts`, `tests/notification/delivery.test.ts`, `CODEX.md`.
- Behavior added: the in-process worker ingests `invite.sent` tenant events, binds each event to the exact invite tenant/project/company/email/role, claims retryable delivery, reads the token from `invites` only when composing email, skips canceled/accepted/expired invites, and records SMTP acceptance as SENT. The email link uses `INVITE_BASE_URL` and SMTP transport from the existing worker.
- Verification: migrations 001-014 and a second run of 014 passed in disposable PostgreSQL 15; targeted notification tests passed 6/6 including PostgreSQL outbox, tenant scoping, token containment, and delivery status; `pnpm tsc --noEmit` and `pnpm test` passed (65 pass, 11 database tests skipped without their URLs). The disposable container was removed; migration 014 was not applied to `survey_dev` in this session.
- Known gap queued for later batches: deployment needs `INVITE_BASE_URL` pointed at an HTTPS invitation page. The `ticket.pc_approval_stuck` system audit event needs a schema-supported system actor; current `ticket_events.actor_id` requires a user, so the worker does not misattribute that event. The 18/24-hour Survey Manager signals are query-time behavior for Ticket/Reporting read paths.
- Production behavior changed: yes, after migration 014 and worker configuration are deployed.
- Module boundary deviation: migration 014 and focused tests accompany the Notification module change.

### 2026-09-25 - Batch 5 (Attachment volume storage)
- Intent: provide authenticated ticket attachments with durable local/Railway volume bytes and audit-preserving cleanup.
- Files touched: `db/migrations/013_attachment_upload_status.sql`, `src/modules/attachment/`, `src/app/api/tickets/[ticketId]/attachments/`, `tests/attachment/attachment.test.ts`, `CODEX.md`.
- Behavior added: bounded raw-byte upload for the owning requester on an active ticket, path-safe volume keys, ticket-status-at-upload metadata and atomic `attachment.uploaded` event, visibility-scoped list/download with `attachment.downloaded` event, and tenant-scoped purge queue and orphan-sweep functions. Download response forces attachment disposition and disables content sniffing.
- Verification: `pnpm tsc --noEmit` passed; migrations 001-014 and a second execution of 013 passed in disposable PostgreSQL 15; attachment tests passed 6/6 with PostgreSQL; full PostgreSQL-backed `pnpm test` passed 85 tests with 2 unrelated skips. The disposable container was removed; migration 013 was not applied to `survey_dev` in this session.
- Known gap queued for later batches: deploy a persistent Railway volume and set `ATTACHMENT_STORAGE_ROOT`; wire `processAttachmentPurgeQueue` and `sweepOrphanedAttachments` into the scheduled draft worker. The API uses raw request bytes with `x-file-name` and `Content-Type` headers rather than multipart form data.
- Production behavior changed: yes, after migration 013 and persistent volume configuration are deployed.
- Module boundary deviation: migration 013 and two API routes accompany the Attachment module change.

### 2026-09-25 - Batch 5 (Ticket help flags)
- Intent: complete Level 1 and Level 2 field-crew overload flags and voluntary ticket pickup.
- Files touched: `db/migrations/016_help_flag_snapshot.sql`, `src/modules/ticket/application/help-flags.ts`, `src/modules/ticket/infrastructure/help-flag.repository.ts`, `src/app/api/projects/[projectId]/help-flags/route.ts`, `tests/ticket/help-flags.test.ts`, `CODEX.md`.
- Behavior added: fixed affected-ticket snapshots; tenant/project/crew-scoped raise, escalation, listing, manual clear, and voluntary claim; same-transaction ticket assignment and help-flag audit events; snapshot-based automatic clear helper for crew reassignment. Migration 016 adds the snapshot column, scoped foreign keys, and active/escalation uniqueness indexes.
- Verification: migration 016 applied to local `survey_dev` by root; focused PostgreSQL tests passed 8/8; `pnpm tsc --noEmit` passed; full PostgreSQL-backed `pnpm test` passed 97 tests with 2 unrelated skips.
- Known gap queued for later batches: other ticket crew reassignment paths must call `clearResolvedFlagsForTicket` within their transactions; Notification must consume `help_flag.ticket_claimed` to notify Survey Manager of voluntary pickup. Both integration hooks were sent to root.
- Production behavior changed: yes, after migration 016 is applied in the target environment.
- Module boundary deviation: one migration, one new API route, and focused tests accompany the Ticket module change.

### 2026-09-25 - Batch 5 (Notification supervisor alerts and system events)
- Intent: notify Survey Managers about voluntary help-flag claims, notify active supervisors about orphaned assignments, and deliver timeout and stuck-approval alerts without attributing system events to a user.
- Files touched: `db/migrations/017_system_ticket_events.sql`, `src/modules/notification/application/index.ts`, `src/modules/notification/infrastructure/notification.repository.ts`, `tests/notification/delivery.test.ts`, `CODEX.md`.
- Behavior added: `help_flag.ticket_claimed`, `approver.timeout_warning_sent`, `approver.timeout_unlocked`, and `ticket.pc_approval_stuck` enter the existing durable notification outbox. Active Survey Managers, including active acting grants, receive claim and orphaned-assignment alerts; stuck approval alerts also reach the assigned Party Chief and Superintendent. Migration 017 permits a NULL audit actor for system events and enforces one 18-hour and one 24-hour timeout event per ticket.
- Verification: migration 017 applied to local `survey_dev` by root; a second run passed in disposable PostgreSQL 15. Focused notification tests passed 7/7 against PostgreSQL, including acting Survey Manager routing and duplicate timeout rejection. `pnpm tsc --noEmit` and `pnpm test` passed (90 pass, 17 database tests skipped without their URLs). The disposable database was removed.
- Known gap queued for later batches: the Ticket read path must emit the 18/24-hour timeout events at query time; a 30-minute worker scanner must emit `ticket.pc_approval_stuck` using a system audit helper; user deactivation must emit `ticket.assignment_orphaned` per affected ticket. Notification delivery is ready to consume those events.
- Production behavior changed: yes, after the event producers and worker are deployed.
- Module boundary deviation: migration 017 and focused tests accompany the Notification module change.

### 2026-09-25 - Batch 5 (Tenancy continuity and AOR operations)
- Intent: complete project continuity, designated acting Survey Manager, vacancy grants, AOR retirement and reassignment, and crew-roster lifecycle.
- Files touched: `src/modules/tenancy/application/project-continuity.ts`, `src/modules/tenancy/application/aor-operations.ts`, `src/modules/tenancy/application/ports.ts`, `src/modules/tenancy/infrastructure/tenancy.repository.ts`, `src/app/api/projects/[projectId]/continuity/route.ts`, `src/app/api/projects/[projectId]/aor-operations/route.ts`, `tests/tenancy/continuity.test.ts`, `tests/tenancy/aor-operations.test.ts`, `CODEX.md`.
- Behavior added: active-project Survey Manager designation, vacancy acting-grant issue/confirm/revoke with hard removal checks, archival, guarded AOR retirement and user/department AOR reassignment, and active roster create/move/deactivate. Tenant/project scope and matching audit events are enforced in transactions.
- Verification: focused PostgreSQL tests and the full database-backed suite passed; final full suite passed 105 tests with 2 unrelated skips; `pnpm tsc --noEmit` passed.
- Known gap queued for later batches: no new Tenancy continuity or AOR gap identified in this session.
- Production behavior changed: yes.
- Module boundary deviation: two new project API routes and focused tests accompany the Tenancy module changes.

### 2026-09-25 - Batch 5 (Tenancy setup delegation and department lifecycle)
- Intent: finish SETUP-only Project Admin delegation and department operational changes.
- Files touched: `src/modules/tenancy/application/add-project-member.ts`, `src/modules/tenancy/application/whitelist.ts`, `src/modules/tenancy/application/aor-operations.ts`, `src/modules/tenancy/application/department-operations.ts`, `src/modules/tenancy/application/ports.ts`, `src/modules/tenancy/infrastructure/tenancy.repository.ts`, `src/app/api/projects/[projectId]/departments/operations/route.ts`, `tests/tenancy/setup-delegation.test.ts`, `tests/tenancy/department-operations.test.ts`, `CODEX.md`.
- Behavior added: SETUP-only Project Admin membership and whitelist delegation, SETUP roster seeding, title reassignment, titled-member removal with reason and final-manager protection, title catalog/default-priority edits, missing-manager assignment, and department AOR movement. Tenant-wide company domains remain Tenant Admin only because the schema has no project binding.
- Verification: focused PostgreSQL department tests passed 5/5; final full database-backed suite passed 105 tests with 2 unrelated skips; `pnpm tsc --noEmit` passed.
- Known gap queued for later batches: project-scoped company-domain delegation requires a project-bound domain design before it can be safely granted to Project Admin.
- Production behavior changed: yes.
- Module boundary deviation: one new department API route and focused tests accompany the Tenancy module changes.

### 2026-09-25 - Batch 5 (Survey Manager crew reassignment)
- Intent: reassign crews on active tickets while retaining the current workflow state and clearing resolved help flags.
- Files touched: `src/modules/ticket/application/reassign-crew.ts`, `src/modules/ticket/application/help-flags.ts`, `src/modules/ticket/infrastructure/help-flag.repository.ts`, `src/app/api/tickets/[ticketId]/reassign-crew/route.ts`, `tests/ticket/reassign-crew.test.ts`, `tests/ticket/help-flags.test.ts`, `CODEX.md`.
- Behavior added: Survey Manager may replace an active project crew on ASSIGNED, IN_PROGRESS, PENDING_PC_APPROVAL, or DELAYED tickets. Build, active user, project role, and roster checks run before the write. The transaction writes `ticket.unassigned` then `ticket.assigned`, and clears any Level 1 or 2 help flags whose fixed ticket snapshots are fully reassigned. Help-flag claim now locks the ticket before the flag to match reassignment lock order.
- Verification: focused PostgreSQL reassignment tests passed 5/5; full PostgreSQL-backed `pnpm test` passed 105 tests with 2 unrelated skips; `pnpm tsc --noEmit` passed.
- Known gap queued for later batches: Party Chief and Superintendent Instrument Man-only reassignment remains separate from full Survey Manager crew reassignment.
- Production behavior changed: yes.
- Module boundary deviation: one new ticket API route and focused tests accompany the Ticket module change.

### 2026-09-25 - Batch 5 (Phase 2 query indexes)
- Intent: complete the Phase 2 query index inventory in CLAUDE.md Section 5.
- Files touched: `db/migrations/018_phase2_query_indexes.sql`, `CODEX.md`.
- Behavior added: tenant, project, department, AOR, draft, active acting grant, acting designation, template, and active user lookup indexes. Existing unique constraints and indexes already cover the remaining Section 5 entries.
- Verification: migrations 001–018 applied to fresh disposable PostgreSQL 15; migration 018 reran directly without error; all 15 new indexes were present. `pnpm tsc --noEmit` and `pnpm test` passed (96 pass, 17 database tests skipped without their URLs). Disposable database removed. Migration 018 was not applied to `survey_dev`.
- Known gap queued for later batches: Section 5 requests `department_titles(project_id, department_id)`, but the table has no `project_id`; this migration indexes `(tenant_id, department_id)` for the same tenant-scoped catalog lookup. No unique index was added, so existing rows cannot conflict with this migration.
- Production behavior changed: yes, after migration 018 is applied in the target environment.
- Module boundary deviation: this session owns only the shared migration and append-only CODEX entry.

### 2026-09-25 - Batch 5 (Tenancy continuity health)
- Intent: expose the Section 24 acting-grant confirmation and unresolved crew-vacancy timing windows as project health alerts.
- Files touched: `src/modules/tenancy/application/continuity-health.ts`, `src/modules/tenancy/application/project-continuity.ts`, `src/modules/tenancy/infrastructure/continuity-health.repository.ts`, `src/modules/tenancy/infrastructure/tenancy.repository.ts`, `src/app/api/projects/[projectId]/continuity-health/route.ts`, `tests/tenancy/continuity-health.test.ts`, `tests/tenancy/continuity.test.ts`, `CODEX.md`.
- Behavior added: Project Admin and Tenant Admin can read active acting grants with exact 24-hour confirmation deadline, age, overdue state, and daily reminder key; unresolved Party Chief and Instrument Man vacancies from tenant events and current ticket/roster gaps show a 48-hour notification window and daily escalation key. Active grant listing and confirmation now verify role, project scope, workflow action, active project, active user, and eligible crew membership.
- Verification: focused PostgreSQL health and continuity tests passed 10/10. `pnpm tsc --noEmit` passed before concurrent root-owned removal of legacy Ticket routes/use cases; a later full-suite run had an unrelated legacy cancellation test failure while that cleanup was in progress.
- Known gap queued for later batches: Notification needs a scheduled durable consumer for due grant and crew-vacancy reminder keys with one delivery per project/vacancy/day to TENANT_ADMIN and PROJECT_ADMIN. Current schema has no Section 12 event or durable per-day cursor for these reminders. Vacancies without open tickets or uncovered roster members cannot be classified as operationally unresolved from current records.
- Production behavior changed: yes.
- Module boundary deviation: one new project health API route and focused tests accompany the Tenancy module change.

### 2026-09-25 - Batch 5 (Canonical ticket status backfill)
- Intent: retire persisted legacy `CLOSED` and cancellation statuses while retaining `CREATED` and immutable audit history.
- Files touched: `db/migrations/019_canonical_ticket_statuses.sql`, `tests/db/canonical-status-migration.test.ts`, `CODEX.md`.
- Behavior added: preflight verifies ordered ticket events and supporting timestamps before mapping `CLOSED` to `COMPLETED`, a documented pending survey cancellation to its prior active status, requester-initiated approved cancellation to `REQUESTER_CANCELED`, and a rejected cancellation to its prior work status. Ambiguous rows abort the transaction with ticket IDs for manual resolution. A validated check constraint excludes retired and unknown statuses. Existing audit events are never updated or deleted.
- Verification: fresh PostgreSQL 15 migration 001–019 apply passed; representative legacy fixture aborted atomically on an ambiguous approval, then upgraded after explicit operator resolution; direct rerun passed. The focused database test passed and the full database-backed suite passed 114 tests with 2 skips. `pnpm tsc --noEmit` was clean at baseline; the final run is blocked by stale `.next/types` references to legacy Ticket routes concurrently removed by the root session.
- Known gap queued for later batches: historical non-requester `CANCEL_APPROVED` rows and pending cancellations lacking a written reason or trustworthy initiator metadata require an explicit owner decision and audited remediation before 019 can apply. Legacy `closed_at` remains as historical evidence; no column is dropped.
- Production behavior changed: yes, after migration 019 is applied to the target database.
- Module boundary deviation: this session owns the shared migration, focused migration test, and append-only CODEX entry only.

### 2026-09-25 - Batch 5 (Continuity escalation email delivery)
- Intent: deliver Section 24 overdue acting-grant confirmation and unresolved crew-vacancy reminders through the existing in-process SMTP worker.
- Files touched: `db/migrations/020_continuity_alert_delivery.sql`, `src/modules/notification/application/continuity-alerts.ts`, `src/modules/notification/application/index.ts`, `src/modules/notification/infrastructure/continuity-alert.repository.ts`, `src/modules/notification/infrastructure/notification.repository.ts`, `src/modules/notification/worker.ts`, `tests/notification/continuity-alerts.test.ts`, `CODEX.md`.
- Behavior added: daily per-recipient alert records for unconfirmed Survey Manager grants after 24 hours and unresolved Party Chief/Instrument Man vacancies after 48 hours; active Tenant Admin and Project Admin recipient selection, deduplication, claim leases, retry backoff, and skip after grant/vacancy resolution or recipient role loss. The worker reuses Tenancy continuity health rules. `ticket.im_reassigned` now enters the ticket notification outbox and emails the requester.
- Verification: fresh PostgreSQL 15 migration 001–020 apply and direct 020 rerun passed; focused unit and PostgreSQL integration tests passed 5/5, covering due windows, daily deduplication, resolved-grant skip, and successful delivery marking. Baseline `pnpm tsc --noEmit` and `pnpm test` passed before edits. Final whole-repo checks are blocked by concurrent Ticket/area cleanup: stale generated `.next/types` area route imports and removed `isAorNodeInSuperintendentScope` references in Ticket tests. No Notification type errors were reported.
- Known gap queued for later batches: reminder scans traverse active projects each cycle, so a large project count may warrant a persistent scan cursor later. Historical deactivated roster rows are intentionally used by Tenancy continuity health to detect uncovered crew until a valid replacement is recorded.
- Production behavior changed: yes, after migration 020 is applied and the notification worker is running with SMTP configured.
- Module boundary deviation: Notification infrastructure imports Tenancy continuity health and repository for one source of deadline and unresolved-vacancy rules; one shared migration and focused tests accompany the module change.

### 2026-09-25 - Batch 5 (Scoped survey crew delegation)
- Intent: complete Phase 2 Superintendent and Party Chief ticket assignment authority while retaining Survey Manager project-wide reassignment.
- Files touched: `src/modules/ticket/application/assign-ticket.ts`, `src/modules/ticket/application/reassign-crew.ts`, `src/modules/ticket/application/ports.ts`, `src/modules/ticket/infrastructure/ticket.repository.ts`, `tests/ticket/security.test.ts`, `tests/ticket/reassign-crew.test.ts`, `CODEX.md`. The root session added the existing Section 12 `ticket.im_reassigned` event to `src/modules/audit/domain/types.ts`.
- Behavior added: active Survey Superintendents assign and reassign crews only on tickets in their assigned AOR descendants; their selected Party Chief must also cover that ticket AOR. Party Chiefs may change only the Instrument Man on their own active tickets. Instrument Man-only changes emit `ticket.im_reassigned`; Party Chief changes retain ordered `ticket.unassigned` and `ticket.assigned` events, in the same transaction as the patch and help-flag resolution. Any active project Instrument Man is eligible as Section 9 permits cross-roster assignment.
- Verification: focused tests passed 21 unit cases and 1 skip without a database URL; the PostgreSQL-backed reassignment file passed 7/7, including out-of-AOR rejection and delegated audit events. Full `pnpm test` passed 105 tests with 20 database skips. `pnpm tsc --noEmit` currently reports only stale `.next/types` imports for concurrently removed legacy area routes, with no Ticket errors; root will regenerate build types after route cleanup.
- Known gap queued for later batches: requester notification for IM-only reassignment is handled by Notification Batch 5; roster management UI remains deferred before Phase 3 under Section 9.
- Production behavior changed: yes.
- Module boundary deviation: focused tests and the append-only CODEX entry accompany the Ticket module change; no shared route was modified.

### 2026-09-25 - Batch 5 (Legacy area to AOR retirement)
- Intent: retire Phase 1 area/subarea creation paths and map historical locations to Phase 2 AOR nodes without discarding legacy evidence.
- Files touched: `db/migrations/021_legacy_area_aor_backfill.sql`, `src/app/api/projects/[projectId]/areas/route.ts`, `src/app/api/projects/[projectId]/areas/[areaId]/subareas/route.ts`, `src/modules/tenancy/application/create-area.ts`, `src/modules/tenancy/application/create-subarea.ts`, `src/modules/tenancy/application/index.ts`, `src/modules/tenancy/application/ports.ts`, `src/modules/tenancy/domain/types.ts`, `src/modules/tenancy/infrastructure/tenancy.repository.ts`, `tests/tenancy/authorization.test.ts`, `tests/db/legacy-aor-backfill.test.ts`, `CODEX.md`.
- Behavior changed: removed legacy area/subarea API and repository writes; migration 021 creates deterministic Area/Subarea AOR levels and nodes from historical rows, copies area memberships to AOR assignments, and maps historical tickets to the corresponding subarea node. It retains historical tables and ticket columns. Saved drafts with a selected AOR remain valid, and legacy drafts with area/subarea references are mapped while retaining those references. Ambiguous project, tenant, level, node, code, membership, or ticket mappings abort the migration atomically.
- Verification: baseline `pnpm tsc --noEmit` and `pnpm test` passed. Focused Tenancy authorization test passed 5/5; migration integration tests passed 2/2 against PostgreSQL after the final draft constraint correction, including rerun and fail-closed cases. Migration 001–021 applied on a disposable fresh PostgreSQL database; the PostgreSQL-backed full suite passed 125/127 with 2 skips and no failures before the final constraint correction. Final `pnpm tsc --noEmit` is awaiting root-owned Next type regeneration because stale `.next/types` still import the retired routes; no Tenancy type error was reported.
- Known gap queued for later batches: migration 021 has not been persistently applied to `survey_dev` in this session; root owns the final constraint correction there and the production migration sequence. Historical location tables remain read-only evidence, and ambiguous legacy data needs owner-guided repair before rerunning 021.
- Production behavior changed: yes, after migration 021 is applied.
- Module boundary deviation: one shared migration, two retired API route files, focused tests, and the append-only CODEX entry accompany the Tenancy change.

### 2026-09-25 - Batch 5 (Phase 2 integration and review gates)
- Intent: integrate the audited Phase 2 API, apply its migrations to the local application database, retire legacy workflow endpoints, and close the requested review gates.
- Files touched: `CLAUDE.md`, `README.md`, `.env.example`, `package.json`, `src/app/api/tickets/`, `src/app/api/projects/route.ts`, `src/app/api/users/`, `src/lib/`, `src/modules/audit/`, `src/modules/identity/`, `src/modules/ticket/`, `src/modules/workflow/`, `src/modules/attachment/application/attachments.ts`, `tests/db/`, `tests/lib/`, `tests/ticket/`, `CODEX.md`, and the new audit brief. Shared route, worker, and migration integration was coordinated with the module sessions above.
- Behavior changed: partial drafts and submit-time numbering, 30-day draft retention with immutable event tombstones and attachment cleanup, active-user session epochs and lifecycle cascade, rejected-ticket resubmission, explicit direct-ticket CREATED state, timeout and stuck-approval signals, lower-priority confirmation, active-project action guard, project-template creation, acting-grant workflow scope, REQUESTER-only creation, canonical status retirement, and application priority based on the four-level enum. The older `is_priority` database value is derived on write from `priority` for historical compatibility.
- Verification: migrations 001–021 applied to local `survey_dev`; the final 021 draft constraint was aligned after the initial no-data application. Fresh/upgrade/rerun migration tests and full PostgreSQL-backed `pnpm test` passed (125 passed, 2 intentional skips); `pnpm tsc --noEmit`, `pnpm build`, `git diff --check`, and live `pnpm audit --audit-level=low` passed. The local database has no customer rows and integration tests roll back their fixtures.
- Known gap queued for later batches: deployment still needs SMTP, HTTPS invite URL, persistent attachment volume, and three separately running workers. Ambiguous historical cancellation or AOR rows fail migration preflight and require an audited owner decision. Phase 3 owns the mobile/public UI and multi-role visibility refinement; Phase 4 owns reporting and CSV audit surfaces. No load test establishes the 10,000-ticket target yet.
- Production behavior changed: yes, after these migrations and application/worker processes are deployed.
- Module boundary deviation: this root integration session coordinates shared routes, application modules, migrations, tests, and documentation for the cross-module Phase 2 closeout.

### 2026-09-25 - Batch 5 (Final security remediation and closeout)
- Intent: close the final Phase 2 security review findings, record the domain-configuration owner decision, and verify the integrated migration and application gates.
- Files touched: `src/app/api/invites/route.ts`, `src/app/api/tenants/route.ts`, `src/app/api/tickets/drafts/route.ts`, `src/app/api/projects/[projectId]/help-flags/route.ts`, `src/lib/ticket-route-helpers.ts`, `src/modules/ticket/application/drafts.ts`, `src/modules/ticket/application/help-flags.ts`, `src/modules/ticket/infrastructure/ticket.repository.ts`, `src/modules/ticket/infrastructure/help-flag.repository.ts`, `src/modules/notification/infrastructure/notification.repository.ts`, focused Ticket, Identity, and Notification tests, `CLAUDE.md`, `audits/2026-09-25-phase2-closeout.md`, and `CODEX.md`.
- Behavior changed: invitation tokens are delivered only to invitees, not returned to inviters; subcontractor company isolation now covers help flags and deleted-draft administration; queued ticket notifications recheck current ticket read access; the old unauthenticated tenant-creation endpoint was removed. Owner confirmed that allowed-domain changes remain TENANT_ADMIN-only because they authorize tenant-wide self-registration; SETUP Project Admin uses project-scoped invitations.
- Verification: Codex Security reviewed 151 changed source items and validated four original-snapshot findings, all fixed in the working tree. `pnpm build`, `pnpm tsc --noEmit`, `git diff --check`, and full PostgreSQL-backed `pnpm test` passed (130 pass, 2 skips for dedicated URLs). Both dedicated invite and notification PostgreSQL cases passed separately on a disposable database migrated 001–021, then removed. Local `survey_dev` records all 21 migrations and has zero tickets. Prior live `pnpm audit --audit-level=low` found no known vulnerabilities; dependency files did not change after that audit.
- Known gap queued for later batches: production deployment and staging acceptance still require SMTP, HTTPS invite URL, persistent attachment volume, three workers, and representative load testing. Ambiguous historical status/AOR rows fail migration preflight and require audited repair. Phase 3/4 UI and reporting surfaces remain outside this batch.
- Production behavior changed: yes, after application and worker processes are deployed with these migrations.
- Module boundary deviation: this root closeout coordinates Ticket, Identity, Notification, shared route/helper, and documentation changes with isolated module sessions.

### 2026-09-25 - Batch 5 (Local Docker environment verification)
- Intent: verify the newly established local Docker stack runs the audited Phase 2 image and database rather than the older parallel checkout.
- Files touched: `audits/2026-09-25-phase2-closeout.md`, `CODEX.md` (documentation only). `compose.yaml` and `Dockerfile` were inspected but not changed.
- Behavior changed: none. Local web, notification, draft, and signal containers use `swrtracker:phase2` from this checkout. The notification container points at `survey_dev`, whose `_migrations` table records 001–021. Image hashes for the invitation route, notification repository, and migration 021 match workspace files.
- Verification: HTTP `/api/health` returned 200 with database connected; container-run rollback database security tests passed 3/3; host `pnpm tsc --noEmit` and full PostgreSQL-backed `pnpm test` passed (130 pass, 2 dedicated-URL skips previously tested separately). Web and draft containers can write the shared attachment volume, workers start without logged errors, and the notification container can reach the configured SMTP TCP port.
- Known gap queued for later batches: authenticated SMTP delivery and externally reachable HTTPS invitation links remain unverified; local Compose workers have no health checks or restart policy. Local Docker validation is not a production deployment.
- Production behavior changed: no.
- Module boundary deviation: documentation-only environment verification spans the shared deployment configuration.

### 2026-09-25 - Batch 6 (Phase 3 company lifecycle schema)
- Intent: add the documented Phase 3 company status and project-company relationship foundation.
- Files touched: `db/migrations/022_company_lifecycle_schema.sql`, `tests/db/company-lifecycle-migration.test.ts`, `CODEX.md`.
- Behavior added: existing and newly created companies default to ACTIVE; status accepts only ACTIVE or INACTIVE. Project-company links have one row per pair and tenant-matched foreign keys to both records.
- Verification: migration 022 applied to local `survey_dev`; focused PostgreSQL migration test passed, including direct rerun, invalid status, duplicate pair, and cross-tenant link rejection. Full database-backed tests passed (131 pass, 2 dedicated-URL skips), as did `pnpm tsc --noEmit`, `pnpm build`, and `git diff --check`.
- Known gap queued for later batches: company lifecycle application operations and UI are deferred by CLAUDE.md. The new relationship table has no runtime writer or historical backfill because project-company membership semantics have not yet been specified.
- Production behavior changed: yes, after migration 022 is applied.
- Module boundary deviation: one Tenancy schema migration, its database test, and the append-only CODEX entry.

### 2026-09-25 - Batch 7 (Requester intake options)
- Intent: provide the Phase 3 request form with tenant-scoped project, AOR, and department choices.
- Files touched: `src/modules/tenancy/application/request-options.ts`, `src/modules/tenancy/infrastructure/request-options.repository.ts`, `src/app/api/projects/[projectId]/request-options/route.ts`, `tests/tenancy/request-options.test.ts`, `CODEX.md`.
- Behavior added: authenticated REQUESTER members of an ACTIVE project can read the project name, active AOR nodes with hierarchy paths, available departments, and their current department. Wrong role, inactive user, archived project, and cross-tenant/project access return no options.
- Verification: focused PostgreSQL integration test, full database-backed suite (132 pass, 2 dedicated-URL skips), `pnpm tsc --noEmit`, `pnpm build`, and `git diff --check` passed against `survey_dev` at `host.docker.internal:5433`.
- Known gap queued for later batches: Phase 3 requester UI still needs to consume this endpoint; registration/login UX and draft/submission views remain to be built.
- Production behavior changed: yes.
- Module boundary deviation: one request-options API route and focused integration test accompany the Tenancy module change.

### 2026-09-25 - Batch 8 (Requester entry and drafts UI)
- Intent: make the Phase 3 requester intake usable from a mobile browser.
- Files touched: `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/ui/`, `src/app/login/`, `src/app/drafts/`, `src/app/project/[projectId]/request/`, `src/modules/ticket/application/submit-ticket.ts`, `tests/ticket/request-ui.test.ts`, `CODEX.md`.
- Behavior added: sign-in with a bounded local return path, responsive request form, explicit partial draft saving, paginated draft listing, resume, soft deletion, submit-time validation and numbered confirmation. Date entry handles input events and local-time conversion; validation feedback receives focus. Removed an internal spec reference from the user-facing notice error.
- Verification: baseline 132 database tests passed; final suite passed 134 with 2 dedicated-URL skips against configured `survey_dev`; production build and TypeScript passed. Browser verification on a disposable database on the configured PostgreSQL server covered login, partial save, resume, invalid 48-hour notice, successful submission, and deletion. Database readback confirmed one submitted numbered ticket, one soft-deleted unnumbered draft, and matching audit events. Disposable database removed.
- Known gap queued for later batches: submitted-ticket list/detail, attachments, rejection resubmission, registration/invite entry, and sign-out navigation. Organization ID currently comes from the project link or administrator; a refreshed submitted draft URL currently reports that the draft is no longer editable.
- Production behavior changed: yes.
- Module boundary deviation: requester web pages and shared styles accompany the Ticket UI work; existing Identity and Tenancy APIs are consumed without business-rule duplication.

### 2026-09-25 - Batch 9 (Submitted requests and precise scheduling)
- Intent: complete the requester submission destination and preserve the exact requested execution time.
- Files touched: `src/app/tickets/[ticketId]/`, `src/app/project/[projectId]/requests/`, `src/app/project/[projectId]/request/request-form.tsx`, `src/app/drafts/page.tsx`, `src/app/ui/`, `src/app/globals.css`, `src/app/api/tickets/[ticketId]/route.ts`, `src/modules/tenancy/application/ticket-labels.ts`, `src/modules/tenancy/infrastructure/ticket-labels.repository.ts`, `db/migrations/023_requested_execution_timestamp.sql`, `tests/db/requested-date-migration.test.ts`, `tests/db/drafts.integration.test.ts`, `tests/tenancy/request-options.test.ts`, `tests/ticket/request-ui.test.ts`, `CODEX.md`.
- Behavior added: paginated submitted requests, readable request details and status refresh, contextual navigation, sign-out, and redirect from submitted draft URLs. Authorized ticket reads resolve tenant/project-scoped location and department names, including retired locations and archived projects. Migration 023 changes requested_date from DATE to TIMESTAMPTZ so saving no longer truncates the time before 48-hour validation. Historical calendar dates become midnight UTC; previously discarded times cannot be recovered.
- Verification: baseline 134 database tests passed; final database-backed suite passed 135 with 2 dedicated-URL skips. Standard pnpm test, production build, TypeScript, and diff whitespace checks passed. Migration 023 applied to local survey_dev; regression checks cover non-UTC session conversion, null values, exact instant preservation on rerun, and draft save/submission timestamp round-trip. Browser checks on a disposable database covered submitted list/detail, displayed local time, refresh, submitted draft redirect, sign-out and subsequent 401 protection. Disposable database and local fixture files removed.
- Known gap queued for later batches: attachments UI, requester cancellation/resubmission, registration/invite entry, project discovery, and role-aware action navigation. Apply migration 023 before deploying the updated scheduling behavior.
- Production behavior changed: yes.
- Module boundary deviation: coordinated requester web, one ticket detail API route, Tenancy label service, and one scheduling migration; existing visibility authorization remains the gate before reading labels.

### 2026-09-25 - Batch 10 (Requester attachments UI)
- Intent: make attachment upload and download available from saved drafts and submitted request details.
- Files touched: `src/app/ui/attachments.tsx`, `src/app/project/[projectId]/request/request-form.tsx`, `src/app/tickets/[ticketId]/ticket-detail.tsx`, `src/app/api/tickets/[ticketId]/attachments/route.ts`, its `filename-header.ts`, `src/modules/attachment/application/attachments.ts`, `src/modules/attachment/application/index.ts`, `tests/attachment/attachment.test.ts`, `tests/attachment/filename-header.test.ts`, `CODEX.md`.
- Behavior added: explicit single-file upload with server-provided size limit and permission, paginated attachment listing, authenticated downloads with visible errors, refresh, and upload feedback. New forms require an explicit Save Draft before attaching files; draft submission and detail refresh are disabled during upload. Browser filenames use a percent-encoded UTF-8 header while existing raw filename clients remain supported. The server rechecks upload permission in the existing metadata/audit transaction.
- Verification: baseline TypeScript and 135 database tests passed. Final suite passed 137 tests with 2 dedicated-URL skips; standard pnpm test, production build, TypeScript, and whitespace checks passed. Regression tests cover Unicode/percent filenames, malformed encoding, unsafe filenames, terminal status restrictions, ownership, tenant isolation, and archived projects. Browser verification on a disposable database covered uploading a Unicode-named file to a draft, its persistence after submission, mobile-width content, and download-only controls after completion. HTTP readback matched downloaded bytes exactly and confirmed completed-ticket uploads return 409. Upload/download audit events were inspected. Temporary database, storage, and fixtures removed.
- Known gap queued for later batches: requester cancellation/resubmission, registration/invite entry, project discovery, and role-aware navigation. Attachment deletion remains deferred by the spec. Browser download initiation was exercised; file bytes were independently verified through the authenticated endpoint because the in-app download event did not report completion.
- Production behavior changed: yes.
- Module boundary deviation: Attachment application and one API route plus the shared file panel and its two requester page integration points; no migration or workflow changes.

### 2026-09-25 - Batch 11 (Requester cancellation and resubmission)
- Intent: complete the requester actions for active and rejected requests.
- Files touched: `src/modules/ticket/application/requester-actions.ts`, `src/app/api/tickets/[ticketId]/route.ts`, `src/app/tickets/[ticketId]/requester-actions.tsx`, `src/app/tickets/[ticketId]/ticket-detail.tsx`, `src/app/ui/request-types.ts`, `src/app/project/[projectId]/request/request-form.tsx`, `tests/ticket/requester-actions.test.ts`, `tests/db/drafts.integration.test.ts`, `CODEX.md`.
- Behavior added: ticket detail receives server-derived cancellation and resubmission capabilities after visibility authorization. Owner cancellation offers Keep request or Confirm cancellation and uses the existing atomic transition. Rejected requests can create a linked revision draft, with new date and attachments required; navigation remains locked while the new draft opens to avoid repeated creation. Archived projects and terminal tickets expose no mutation actions. Retired draft locations display their historical name alongside the existing warning. Uploads and requester actions cannot run simultaneously from this surface.
- Verification: baseline TypeScript and 137 database tests passed. Final database-backed suite passed 139 with 2 dedicated-URL skips; production build, TypeScript, and diff whitespace checks passed. Capability tests cover both variants, active/terminal/draft states, peers, tenant admin, isolated companies, archived projects, and missing requester membership. Database resubmission test now verifies field copying, reset priority/date/number, and no copied attachments from a parent with files. Browser flow created a revision from a rejected request with a retired location, submitted it with a new date/number, exercised Keep request, and confirmed cancellation. Readback verified the parent link, preserved original rejection, exact requested instant, and one submission/cancellation audit event each. Disposable database removed.
- Known gap queued for later batches: registration/invite entry, project discovery, role-aware navigation, and survey execution/approval UI. Existing mutations remain authoritative for stale-page permission or state changes.
- Production behavior changed: yes.
- Module boundary deviation: Ticket application capability plus one detail route and requester web/shared response types; no workflow rules or migrations changed.

### 2026-09-25 - Batch 13 (Invitation entry UI)
- Intent: provide the invitation acceptance page targeted by the configured email links.
- Files touched: `src/app/invites/accept/page.tsx`, `src/app/invites/accept/invite-form.tsx`, `src/app/api/invites/route.ts`, `src/app/ui/api.ts`, `tests/ticket/request-ui.test.ts`, `CODEX.md`.
- Behavior added: invitation inspection, new-account acceptance, signed-in acceptance, account switching without discarding the token, explicit expired-session clearing, and accepted/expired/canceled/unbound link messages. Login accepts only the bounded local invitation return path. The page sets no-index and no-referrer metadata. Requester acceptance links to the project request form; other roles return to the home page pending role-aware navigation.
- Verification: baseline and final TypeScript, standard tests, database-backed suite (139 pass, 2 dedicated-URL skips), and diff whitespace checks passed. Dedicated invitation PostgreSQL suite passed all 8 tests on a disposable database. Browser checks covered stale-session clearing, account creation/acceptance, sign-in and request-form access, existing-account acceptance, expired links, and accepted-link reuse UI. Readback found one user, one REQUESTER membership, two distinct invite.accepted events, and one invite.expired event. Automatic review initially rejected the second acceptance; read-only evidence established the synthetic account already held the identical project role, and the reviewed retry succeeded. Disposable database and fixture files removed. Production build passed with a CSS compatibility warning in the concurrently added sample route, outside this checkpoint.
- Known gap queued for later batches: self-registration does not yet assign project membership automatically, so its UI remains queued until that backend gap is closed. Project discovery, role-aware navigation, and survey execution/approval UI remain. Authenticated SMTP delivery remains an environment acceptance task.
- Production behavior changed: yes.
- Module boundary deviation: one Identity API route and invitation web pages plus shared local redirect validation; no permission rules or migrations changed. Concurrent sample/configuration changes are excluded from this checkpoint.

### 2026-09-25 - Batch 14 (Project self-registration)
- Intent: let approved-domain requesters create an account and immediately access their project.
- Files touched: src/modules/identity/application/self-register.ts, src/modules/tenancy/application/self-registration.ts, src/modules/tenancy/infrastructure/self-registration.repository.ts, src/modules/audit/application/index.ts, src/modules/audit/infrastructure/audit.repository.ts, src/app/api/auth/register/route.ts, src/app/register/page.tsx, src/app/register/register-form.tsx, src/app/login/login-form.tsx, tests/identity/registration.test.ts, tests/identity/self-registration.test.ts, CODEX.md.
- Behavior added: project-link registration derives the company from one approved domain binding, checks ACTIVE project and tenant scope, creates only REQUESTER membership, and records user.self_registered atomically with account creation. Authorization rows remain locked through commit. Unapproved, unbound, ambiguous domains and mismatched companies fail closed. Registration UI links from project sign-in and returns to that project after account creation.
- Verification: baseline TypeScript and 139 database-backed tests passed. Final production build, TypeScript, standard pnpm test (116 pass, 26 database skips), full database-backed suite (140 pass, 2 dedicated-URL skips), and whitespace checks passed. Integration tests cover tenant/project/company boundaries, inactive projects, domain binding, duplicate account, exact role and event payload, and rollback of user and membership on audit failure. Browser checks covered denied domain, approved account creation, sign-in, and project request form; database readback confirmed exactly one REQUESTER membership and registration event. Disposable database and fixtures removed.
- Known gap queued for later batches: existing accounts need invitations to join additional projects; project discovery, role-aware navigation, and survey execution/approval UI remain. Registration API now requires projectId; companyId is optional and must match the domain binding when supplied.
- Production behavior changed: yes.
- Module boundary deviation: Identity orchestrates Tenancy and Audit application services, with one registration API route and entry pages; no migration. Concurrent sample/configuration changes are excluded.

### 2026-09-25 - Batch 15 (Project directory)
- Intent: let signed-in users discover accessible projects without copying project IDs.
- Files touched: src/modules/tenancy/application/project-directory.ts, src/modules/tenancy/infrastructure/project-directory.repository.ts, src/app/api/projects/route.ts, src/app/projects/page.tsx, src/app/page.tsx, src/app/ui/api.ts, src/app/ui/shell.tsx, tests/tenancy/project-directory.test.ts, CODEX.md.
- Behavior added: paginated authenticated project listing scoped to active users and project membership, with tenant-wide discovery for tenant administrators. Project cards expose server-derived request capabilities, setup messaging, and archived read-only labels. Navigation and default sign-in destination lead to Projects; explicit draft, request and invitation return paths are preserved.
- Verification: baseline TypeScript and standard tests passed. Final production build, TypeScript, standard suite (116 pass, 27 database skips), full PostgreSQL suite (141 pass, 2 dedicated-URL skips), and whitespace checks passed. Integration coverage verifies tenant boundaries, membership removal, deactivation, admin discovery without requester privileges, pagination, lifecycle capabilities and invalid pagination. An initial fixture incorrectly attempted two memberships for one user/project; corrected to the schema's single-role constraint. Browser visual verification remains pending.
- Known gap queued for later batches: role-specific survey execution/approval actions and administrator setup UI remain; setup cards describe pending activation without an administration destination.
- Production behavior changed: yes.
- Module boundary deviation: Tenancy directory service plus one project API route and shared web navigation; no migration. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 16 (Survey Manager review controls)
- Intent: expose approval and rejection decisions from ticket details.
- Files touched: src/modules/ticket/application/review-actions.ts, src/app/api/tickets/[ticketId]/route.ts, src/app/tickets/[ticketId]/review-actions.tsx, src/app/tickets/[ticketId]/ticket-detail.tsx, src/app/ui/request-types.ts, tests/ticket/review-actions.test.ts, CODEX.md.
- Behavior added: server-derived review capability for independent Survey Managers on submitted standard-workflow tickets in active projects. Explicit approval confirmation and written rejection reason call the existing transaction-backed commands. Controls prevent repeated submission and concurrent attachment/requester actions; successful decisions refresh ticket details, while errors remain visible.
- Verification: baseline TypeScript and standard suite passed. Final production build, TypeScript, standard suite (117 pass, 27 database skips), full database-backed suite (142 pass, 2 dedicated-URL skips), and whitespace checks passed. Capability coverage includes actor role, requester/lead/manager self-conflicts, all other states, direct-assignment variant, isolated companies, archived projects, and propagated infrastructure failures. Existing transition/visibility/atomic audit tests remain passing. Browser verification of this UI and the project directory remains pending.
- Known gap queued for later batches: assignment, field execution, survey cancellation and other elevated workflow controls remain; this checkpoint covers initial review only.
- Production behavior changed: yes.
- Module boundary deviation: Ticket application capability plus one detail API route and web/shared types; no migration or mutation-rule changes. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 17 (Review browser verification and request navigation)
- Intent: verify project discovery and review decisions end to end and correct an unavailable request link found during verification.
- Files touched: src/modules/ticket/application/requester-actions.ts, src/app/api/tickets/route.ts, src/app/project/[projectId]/requests/request-list.tsx, CODEX.md.
- Behavior changed: request lists display New request only when the existing active-project requester eligibility query permits it. Capability is supplied by the application service; creation endpoints remain authoritative.
- Verification: browser checks on a disposable database covered default login to Projects, active/archived/setup project cards, manager approval confirmation, empty rejection reason validation, rejection with written reason, refreshed terminal decision controls, requester-only project discovery and new-request link, and requester visibility of rejection and revision controls. Database readback confirmed one ticket.approved event and one ticket.rejected event, correct states and exact reason. Both roles were rechecked after the navigation fix. Baseline and final TypeScript and standard suite passed (117 pass, 27 database skips); final database suite passed 142 with 2 dedicated-URL skips. Production build and whitespace checks passed. Disposable database and fixture files removed.
- Known gap queued for later batches: crew assignment and field execution controls remain. Browser behavior verification for Batches 15 and 16 is now complete; responsive visual QA remains a later pass.
- Production behavior changed: yes.
- Module boundary deviation: Ticket capability plus one list API route and its request-list UI; no migration or authorization policy changes. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 18 (Assignment candidate service)
- Intent: provide eligible, searchable crew choices for the assignment UI.
- Files touched: src/modules/tenancy/application/assignment-candidates.ts, src/modules/tenancy/infrastructure/assignment-candidates.repository.ts, src/modules/ticket/application/assignment-options.ts, src/app/api/tickets/[ticketId]/assign/route.ts, tests/tenancy/assignment-candidates.test.ts, CODEX.md.
- Behavior added: authenticated GET assignment options checks ticket visibility, assignment transition, active project and manager/superintendent authority before listing crew. Candidate names are tenant/project/role scoped and exclude deactivated users. Superintendent Party Chief candidates require active assignment at the ticket location or an ancestor; managers can choose project-wide. Instrument Men remain project-scoped as in the existing assignment command. Slim returns no Party Chief choices. Bounded literal-name search and pagination apply after scope filtering.
- Verification: baseline and final TypeScript and standard tests passed. Final PostgreSQL suite passed 144 with 2 dedicated-URL skips; standard suite passed 118 with 28 database skips. Production build and whitespace checks passed. Added real PostgreSQL candidate tests for tenant/project isolation, roles, inactive users, inherited AOR, deactivated scope, archived project, literal search and pagination; application tests cover invisible ticket, wrong role/state, inactive project, Superintendent scope and Slim behavior.
- Known gap queued for later batches: assignment picker UI and browser acceptance remain next; reassignment and field execution controls are still pending.
- Production behavior changed: yes, additive read endpoint only.
- Module boundary deviation: Ticket authorization orchestrates Tenancy candidate application service plus one existing assignment API route and focused tests; no migration or mutation changes. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 19 (Crew assignment picker)
- Intent: let authorized survey managers and superintendents assign eligible crew from ticket details.
- Files touched: src/modules/ticket/application/assignment-options.ts, src/app/api/tickets/[ticketId]/route.ts, src/app/tickets/[ticketId]/assignment-actions.tsx, src/app/tickets/[ticketId]/ticket-detail.tsx, src/app/ui/request-types.ts, tests/ticket/assignment-capability.test.ts, CODEX.md.
- Behavior added: shared read authorization supplies assignment capability to visible ticket details. Full/Medium pickers require a Party Chief and optionally an Instrument Man; Slim shows only its required Instrument Man. Candidate search and pagination preserve selected names; explicit confirmation calls the existing atomic assignment command. Duplicate submission, concurrent ticket actions and upload are disabled while assignment runs. Errors remain visible and successful assignment refreshes status.
- Verification: baseline and final TypeScript and standard tests passed. Final standard suite passed 119 with 28 database skips; database-backed suite passed 145 with 2 dedicated-URL skips. Production build and whitespace checks passed. Capability tests cover all builds, wrong role/state, archived project, AOR denial and infrastructure error propagation. Browser checks covered missing-chief validation, candidate selection, retained selection across empty search, Medium PC+IM assignment, Slim IM-only controls and assignment, and refreshed Scheduled state. Database readback verified both exact crew combinations and one matching ticket.assigned event each. Disposable database and fixtures removed.
- Known gap queued for later batches: assigned-crew name display, reassignment, and field execution controls remain. Full shares the Medium picker shape and is covered by existing assignment tests; Full/Superintendent browser scenarios and responsive visual QA remain for later acceptance.
- Production behavior changed: yes.
- Module boundary deviation: Ticket application capability, one detail API route, and ticket web/shared types; no migration or assignment mutation policy changes. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 20 (Assigned crew details)
- Intent: show assigned personnel by name on ticket details.
- Files touched: src/modules/tenancy/application/ticket-labels.ts, src/modules/tenancy/infrastructure/ticket-labels.repository.ts, src/app/api/tickets/[ticketId]/route.ts, src/app/ui/request-types.ts, src/app/tickets/[ticketId]/ticket-detail.tsx, tests/tenancy/request-options.test.ts, CODEX.md.
- Behavior added: authorized ticket reads resolve assigned Party Chief and Instrument Man names within the ticket tenant, and render an Assigned crew section. Missing roles remain omitted for Slim and optional IM assignments. Historical names remain available after personnel deactivation or project archival; foreign-tenant or missing referenced users fail closed. No current membership requirement is imposed on historical crew references.
- Verification: baseline and final TypeScript and standard tests passed. Final standard suite passed 119 with 28 database skips; PostgreSQL suite passed 145 with 2 dedicated-URL skips. Production build and whitespace checks passed. Extended real database label coverage verifies assigned names, absent assignments, cross-tenant user rejection and historical deactivated-user names on archived projects. Browser rendering of this small detail addition remains unverified.
- Known gap queued for later batches: reassignment and field execution controls remain next.
- Production behavior changed: yes.
- Module boundary deviation: Tenancy label service plus one authorized detail route and its web/shared response types; no migration or workflow mutation change. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 21 (Field execution controls)
- Intent: make existing field workflow commands available from ticket details.
- Files touched: src/modules/ticket/application/field-actions.ts, src/app/api/tickets/[ticketId]/route.ts, src/app/ui/request-types.ts, src/app/tickets/[ticketId]/field-actions.tsx, src/app/tickets/[ticketId]/ticket-detail.tsx, tests/ticket/field-actions.test.ts, CODEX.md.
- Behavior added: server-derived capabilities expose start, Instrument Man completion/delay/field-cancellation reports, lead approval or rejection, delayed-work restart, and direct completion where no Instrument Man is assigned. Pending reports and reasons are readable by authorized ticket viewers. Explicit confirmation, required delay reason, permanent field-cancellation wording, visible errors, duplicate submission guards, and mutual exclusion with other ticket actions accompany the existing transaction-backed endpoints.
- Verification: baseline and final TypeScript and standard tests passed. Final standard suite passed 121 with 28 database skips; PostgreSQL suite passed 147 with 2 dedicated-URL skips. Production build and whitespace checks passed. New table-driven capability tests cover both variants, crew ownership, approval chain, Slim start, completion with/without IM, delay restart, cancellation request/review, terminal states, wrong roles, company scope, archived projects and infrastructure failures. Existing field workflow and atomic audit tests continue passing. Browser acceptance is pending for the next checkpoint.
- Known gap queued for later batches: browser field-execution verification, survey-side cancellation, reassignment and priority controls remain.
- Production behavior changed: yes.
- Module boundary deviation: Ticket capability plus one detail API route and ticket web/shared response types; no migration or mutation policy change. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 22 (Field workflow browser acceptance)
- Intent: verify assigned crew display and field execution across Instrument Man and Party Chief accounts.
- Files touched: CODEX.md only; disposable local fixture files removed after use.
- Behavior verified: assigned crew names render; assigned Instrument Man starts work, receives required-delay-reason feedback, submits a delay; Party Chief approves delay and restarts work; Instrument Man reports completion; Party Chief approves completion; completed request has no field mutation controls. Pending reports and reasons remain visible between roles.
- Verification: browser flow ran against a disposable database on the configured PostgreSQL server. Final completion initially stalled because the local preview stopped answering both browser and independent health requests; database still showed pending completion with no active DB queries. Stopped the confirmed live preview process, restarted it, reloaded state and retried successfully. Readback proved COMPLETED with completion timestamp, cleared pending status and delay reason, exactly one start/delay/restart/completion event and two report/approval events. No duplicate completion event. TypeScript and standard suite passed (121 pass, 28 database skips); production code is unchanged from Batch 21's passing build and 147 database tests. Disposable database and fixtures removed.
- Known gap queued for later batches: field cancellation/return-to-work browser branches, responsive visual QA, survey cancellation, reassignment and priority UI remain. Preview stall cause was not established; recovery was verified without changing production code.
- Production behavior changed: no.
- Module boundary deviation: append-only verification record only; concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 23 (Survey cancellation controls)
- Intent: expose survey-side cancellation and its approval chain on ticket details.
- Files touched: src/modules/ticket/application/survey-cancel-actions.ts, src/app/api/tickets/[ticketId]/route.ts, src/app/ui/request-types.ts, src/app/tickets/[ticketId]/survey-cancel-actions.tsx, src/app/tickets/[ticketId]/ticket-detail.tsx, tests/ticket/survey-cancel-actions.test.ts, CODEX.md.
- Behavior added: Survey Manager can confirm immediate permanent cancellation with a written reason; assigned Party Chief or responsible Superintendent can submit for approval. Pending requests display without changing the work-status label. Only the required higher survey lead can approve, and self-approval is hidden. Duplicate submission and concurrent mutations are blocked in the UI; existing commands remain authoritative and preserve atomic audit events.
- Verification: baseline and final TypeScript and standard tests passed. Final standard suite passed 123 with 28 database skips; PostgreSQL suite passed 149 with 2 dedicated-URL skips. Production build and whitespace checks passed. New capability tests cover PC/Superintendent/Manager chains, self-approval, pending and terminal states, peer/wrong-role rejection, company isolation, inactive project and infrastructure failures. Existing database cancellation-chain tests pass. Browser verification remains queued.
- Known gap queued for later batches: survey-cancellation browser acceptance, reassignment, priority controls and responsive visual QA remain.
- Production behavior changed: yes.
- Module boundary deviation: Ticket capability plus one detail API route and ticket web/shared response types; no migration or command policy changes. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 24 (Priority adjustment controls)
- Intent: expose Survey Manager priority adjustment with the required High-downgrade confirmation.
- Files touched: src/modules/ticket/application/priority-actions.ts, src/app/api/tickets/[ticketId]/route.ts, src/app/ui/request-types.ts, src/app/tickets/[ticketId]/priority-actions.tsx, src/app/tickets/[ticketId]/ticket-detail.tsx, tests/ticket/priority-actions.test.ts, CODEX.md.
- Behavior added: eligible Survey Managers see current priority and can elevate to High or select a server-derived lower priority. A native modal dialog requires confirmation before showing the reason field for a High downgrade. Every adjustment requires a written reason and uses existing audited endpoints. Pending submission disables other actions, errors remain visible, and successful changes refresh details.
- Verification: baseline and final TypeScript and standard tests passed. Final standard suite passed 124 with 28 database skips; PostgreSQL suite passed 150 with 2 dedicated-URL skips. Production build and whitespace checks passed. Capability tests cover each rank, terminal/draft/rejected states, wrong roles, company isolation, archived project and infrastructure failure propagation. Existing database High downgrade confirmation/audit checks remain passing. Browser acceptance for priority and survey cancellation is pending.
- Known gap queued for later batches: browser acceptance, crew reassignment and responsive visual QA remain. Elevation currently uses the existing High-only endpoint; lower controls preserve the existing rejection restriction.
- Production behavior changed: yes.
- Module boundary deviation: Ticket capability plus one detail API route and ticket web/shared types; no migration or mutation policy change. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 25 (Priority and survey cancellation browser acceptance)
- Intent: verify the published priority and survey cancellation controls through the production browser UI.
- Files touched: CODEX.md.
- Behavior verified: assigned Party Chief must supply a cancellation reason and cannot self-approve; Survey Manager approval preserves the reason and ends in Canceled by Survey Team. High downgrade displays confirmation before its reason form, Keep High leaves priority unchanged, confirmed downgrade reaches Medium, and elevation returns to High. Direct Survey Manager cancellation requires a reason and removes mutation controls after completion.
- Verification: disposable PostgreSQL database readback proved both terminal cancellations and exactly five expected audit events: one requested cancellation, two completed cancellations, one confirmed High downgrade, and one elevation. Approval actor chain and confirmation payload were checked. TypeScript passed; standard suite passed 124 with 28 database skips. No production code changed. Disposable database, fixtures and browser tab removed.
- Known gap queued for later batches: crew reassignment, responsive visual QA and remaining role surfaces. During direct cancellation the preview stopped answering an independent health request; database confirmed no cancellation write. Explicitly stopped the live preview, restarted, reloaded and retried successfully without duplicate events. Preview stall cause remains unestablished.
- Production behavior changed: no.
- Module boundary deviation: append-only verification record; concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 26 (Reassignment candidate service)
- Intent: provide authorized searchable crew candidates for the upcoming reassignment controls.
- Files touched: src/modules/ticket/application/reassignment-options.ts, src/app/api/tickets/[ticketId]/reassign-crew/route.ts, tests/ticket/reassignment-options.test.ts, CODEX.md.
- Behavior added: GET reassignment options resolves ticket visibility before looking up candidates, permits only active assigned/in-progress/pending/delayed work, and applies existing survey authority rules. Superintendent chief choices are AOR scoped; Instrument Man choices are project-wide. Assigned Party Chiefs can choose only IM replacements on their own ticket. Slim exposes required IM selection without chief replacement. Capability helper supplies form constraints; mutation endpoint and audit transactions are unchanged.
- Verification: baseline TypeScript and 124 standard tests passed. Final TypeScript and production build passed; standard suite passed 128 with 28 database skips; PostgreSQL suite passed 154 with 2 dedicated-URL skips. New tests cover tenant/visibility denial, role/ownership boundaries, AOR candidate constraints, crew builds, pagination, invalid states/queries and infrastructure failure propagation. Existing PostgreSQL candidate-isolation and reassignment/audit tests remain passing. Whitespace checks passed.
- Known gap queued for later batches: wire the crew reassignment picker and capability into ticket detail; browser and responsive acceptance remain pending. Superintendent-of-record replacement is a separate remaining action.
- Production behavior changed: yes (read-only candidate API).
- Module boundary deviation: Ticket application plus one existing ticket API route, with cross-module candidate access through the Tenancy application service. No migrations. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 27 (Crew reassignment controls)
- Intent: connect the authorized reassignment candidate service to ticket details.
- Files touched: src/app/api/tickets/[ticketId]/route.ts, src/app/ui/request-types.ts, src/app/tickets/[ticketId]/assignment-actions.tsx, src/app/tickets/[ticketId]/reassignment-actions.tsx, src/app/tickets/[ticketId]/ticket-detail.tsx, CODEX.md.
- Behavior added: server-derived reassignment capability controls visibility and crew shape. The searchable picker retains current assignments, supports manager/Superintendent chief replacement and assigned Party Chief IM swaps, and requires a written reason. Unchanged assignments and missing required crew are rejected before submission. Pending report status is explained; successful audited reassignment refreshes details. Duplicate and concurrent mutations are disabled. The existing assignment picker is reused through an explicit endpoint option.
- Verification: baseline and final TypeScript passed; standard suite passed 128 with 28 database skips; PostgreSQL suite passed 154 with 2 dedicated-URL skips. Production build and whitespace checks passed. Existing capability, scoped candidate, reassignment state preservation and audit transaction tests remain green. Browser acceptance of the new form is queued next.
- Known gap queued for later batches: browser acceptance and responsive QA; separate Superintendent-of-record replacement and remaining role surfaces.
- Production behavior changed: yes.
- Module boundary deviation: one detail API route and ticket web/shared response types; application authority and mutation policies unchanged. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 28 (Crew reassignment browser acceptance)
- Intent: verify the published reassignment controls against a disposable PostgreSQL fixture through the production browser UI.
- Files touched: CODEX.md.
- Behavior verified: Party Chief sees a fixed chief and selectable project IMs; unchanged crew and missing reason are rejected. Successful IM swap refreshes assigned names while retaining the pending delay report. Manager can replace the chief, retains selection through an empty search, and saves with the pending report intact.
- Verification: database assertions confirmed replacement chief/IM, unchanged PENDING_PC_APPROVAL, pending DELAYED report, reason and original reporter, exactly one ticket.im_reassigned and one ticket.unassigned/ticket.assigned pair with expected actors. TypeScript and standard suite passed (128 pass, 28 database skips). Production code unchanged from Batch 27's passing build and 154 PostgreSQL tests. No preview stall occurred in this run. Disposable database, fixture files and browser tab removed; preview stopped.
- Known gap queued for later batches: Superintendent and Slim UI acceptance, responsive visual QA, Superintendent-of-record replacement, override rejection and remaining role surfaces.
- Production behavior changed: no.
- Module boundary deviation: append-only verification record; concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 29 (Superintendent snapshot reassignment command)
- Intent: implement the missing Superintendent-of-record replacement required by CLAUDE.md Section 9.
- Files touched: src/modules/ticket/application/reassign-superintendent.ts, src/app/api/tickets/[ticketId]/reassign-superintendent/route.ts, src/modules/audit/domain/types.ts, tests/ticket/reassign-superintendent.test.ts, CODEX.md.
- Behavior added: Survey Manager can replace the Superintendent snapshot on assigned, in-progress, pending or delayed tickets in an active Full Build project. Replacement must be an active project Superintendent covering the ticket AOR. Required written reason, no-op rejection, tenant/company scope and row locking precede the snapshot update. Existing ticket.superintendent_reassigned event from the specification records old/new IDs and reason in the same transaction; current work status and pending report remain intact.
- Verification: baseline TypeScript and 128 standard tests passed. Final TypeScript, production build and whitespace checks passed. Standard suite passed 130 with 29 database skips; PostgreSQL suite passed 157 with 2 dedicated-URL skips. New tests cover authority, company/tenant isolation, terminal states, crew build, invalid reasons, inactive replacement and unchanged assignments. PostgreSQL rollback test verifies snapshot recovery when audit insertion fails, then one successful event with the expected payload and preserved report.
- Known gap queued for later batches: Superintendent candidate lookup, detail controls and browser acceptance; remaining role surfaces and responsive QA.
- Production behavior changed: yes.
- Module boundary deviation: Ticket application and one new API route plus Audit event type registration for an event already defined in CLAUDE.md; no new event name or migration. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 30 (Superintendent selection and detail controls)
- Intent: complete the ticket-detail surface for Superintendent-of-record replacement.
- Files touched: src/modules/tenancy/application/assignment-candidates.ts, src/modules/tenancy/application/ticket-labels.ts, src/modules/tenancy/infrastructure/ticket-labels.repository.ts, src/modules/ticket/application/superintendent-options.ts, src/app/api/tickets/[ticketId]/reassign-superintendent/route.ts, src/app/api/tickets/[ticketId]/route.ts, src/app/ui/request-types.ts, src/app/tickets/[ticketId]/assignment-actions.tsx, src/app/tickets/[ticketId]/superintendent-actions.tsx, src/app/tickets/[ticketId]/ticket-detail.tsx, tests/tenancy/assignment-candidates.test.ts, tests/tenancy/request-options.test.ts, tests/ticket/superintendent-options.test.ts, CODEX.md.
- Behavior added: visible eligible Full Build tickets expose Survey Manager Superintendent controls. Search and pagination return only active project Superintendents with ancestor AOR coverage. The form requires a replacement and reason, rejects unchanged assignments, uses the audited command and refreshes details. Assigned crew now shows the tenant-scoped historical Superintendent name, including deactivated users. Duplicate and concurrent mutations are disabled.
- Verification: baseline TypeScript and 130 standard tests passed. Final TypeScript, production build and whitespace checks passed; standard suite passed 132 with 29 database skips; PostgreSQL suite passed 159 with 2 dedicated-URL skips. New capability tests cover role/company/state/build and missing-ticket gates, scope propagation and error propagation. Database coverage verifies Superintendent ancestor scope, inactive exclusion, foreign-tenant label denial and historical names. Browser acceptance is queued next.
- Known gap queued for later batches: Superintendent browser acceptance, override rejection and remaining role surfaces; responsive QA.
- Production behavior changed: yes.
- Module boundary deviation: sequential Tenancy candidate/label extension and Ticket application/UI integration, with two related existing API routes and shared response types. Cross-module access remains through application services. No migrations or mutation policy changes. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 31 (Superintendent browser acceptance)
- Intent: verify Superintendent reassignment through the production UI against a disposable Full Build fixture.
- Files touched: CODEX.md.
- Behavior verified: current Superintendent name is visible; picker excludes inactive and out-of-AOR Superintendents; unchanged selection and missing reason are rejected. Manager replacement refreshes the displayed name and preserves pending delay information. Signing in as the replacement shows the new assignment and field approval controls but no Superintendent reassignment control.
- Verification: PostgreSQL assertions proved preserved PENDING_PC_APPROVAL and pending DELAYED report/reason, replacement snapshot, and exactly one ticket.superintendent_reassigned event with the correct manager actor, old/new IDs and written reason. TypeScript passed; standard suite passed 132 with 29 database skips. No production changes since Batch 30's passing build and 159 PostgreSQL tests. Preview stopped, disposable database and fixtures removed, browser tab closed.
- Known gap queued for later batches: override rejection, remaining role surfaces and responsive visual QA; outstanding Slim/Superintendent crew-reassignment browser branches.
- Production behavior changed: no.
- Module boundary deviation: append-only verification record; concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 32 (Rejection override controls)
- Intent: expose the existing audited rejection override command on ticket details.
- Files touched: src/modules/ticket/application/review-actions.ts, src/app/ui/request-types.ts, src/app/tickets/[ticketId]/review-actions.tsx, tests/ticket/review-actions.test.ts, CODEX.md.
- Behavior added: eligible Survey Managers see Override rejection on rejected standard-approval requests. Confirmation explains the return to approval and requires a written override reason. Existing requester, recorded lead and recorded manager self-conflicts suppress the action, as do company isolation and inactive projects. Success refreshes details; duplicate and concurrent mutations are disabled. Existing override command and endpoint remain authoritative.
- Verification: baseline TypeScript and 132 standard tests passed. Final TypeScript and production build passed; standard suite passed 133 with 29 database skips; PostgreSQL suite passed 160 with 2 dedicated-URL skips. New capability tests cover rejected state, all self-conflict fields, wrong roles, company isolation, direct workflow, deleted draft, inactive project and infrastructure error propagation. Existing mutation tests remain passing. Whitespace check passed after removing a trailing blank line. Browser acceptance is queued next.
- Known gap queued for later batches: override browser acceptance, remaining role surfaces and responsive visual QA.
- Production behavior changed: yes.
- Module boundary deviation: Ticket application capability plus ticket web/shared response types; no route, command, migration or authority changes. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 33 (Rejection override state guard)
- Intent: close a command-level state gap found while preparing override acceptance.
- Files touched: src/modules/ticket/application/override-rejection.ts, tests/ticket/override-rejection-state.test.ts, CODEX.md.
- Behavior changed: overrideRejection explicitly requires REJECTED before writing. Previously the shared transition map also permitted SUBMITTED to APPROVED, allowing a direct override call to record a rejection-override event for a ticket that had not been rejected. Normal approval remains available through its own command.
- Verification: baseline TypeScript and 133 standard tests passed. Final TypeScript, production build and whitespace checks passed; standard suite passed 134 with 29 database skips; PostgreSQL suite passed 161 with 2 dedicated-URL skips. New regression checks all non-rejected statuses and asserts no state or audit writes; existing successful override and self-conflict tests remain green.
- Known gap queued for later batches: override browser acceptance, remaining role surfaces and responsive visual QA.
- Production behavior changed: yes.
- Module boundary deviation: none beyond append-only CODEX record; concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 34 (Rejection override browser acceptance)
- Intent: verify the corrected override flow through the production UI.
- Files touched: CODEX.md.
- Behavior verified: recorded-manager self-conflict hides the override control; an independent manager sees the override confirmation on a rejected request. Blank reason is rejected. Successful override refreshes to Approved - Awaiting Assignment, removes the current rejection notice and exposes crew assignment.
- Verification: PostgreSQL assertions confirmed APPROVED with approval timestamp and cleared current rejection reason, unchanged self-conflict fixture, and exactly one ticket.rejection_overridden event with the correct actor and written reason. TypeScript passed; standard suite passed 134 with 29 database skips. Production unchanged from Batch 33's passing build and 161 PostgreSQL tests. Preview stopped; disposable database, fixture files and browser tab removed.
- Known gap queued for later batches: remaining role surfaces (help flags, CAD and administration) and responsive visual QA; outstanding Slim/Superintendent crew-reassignment browser branches.
- Production behavior changed: no.
- Module boundary deviation: append-only verification record; concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 35 (CAD status visibility)
- Intent: expose the existing CAD sub-track record as the foundation for CAD workflow surfaces.
- Files touched: src/modules/ticket/application/cad-summary.ts, src/modules/ticket/infrastructure/cad-summary.repository.ts, src/app/api/tickets/[ticketId]/route.ts, src/app/ui/request-types.ts, src/app/tickets/[ticketId]/ticket-detail.tsx, tests/ticket/cad-summary.test.ts, CODEX.md.
- Behavior added: authorized ticket details show the recorded CAD status and completion date. The service establishes ticket visibility before querying tenant/ticket-scoped CAD data. Missing legacy records are explicitly displayed; duplicate records raise a conflict instead of selecting an arbitrary result. No CAD mutation rules introduced.
- Verification: baseline TypeScript and 134 standard tests passed. Final TypeScript, production build and whitespace checks passed; standard suite passed 135 with 30 database skips; PostgreSQL suite passed 163 with 2 dedicated-URL skips. New tests cover visibility before data retrieval, scope propagation, missing/duplicate records, infrastructure errors, and real PostgreSQL tenant/ticket isolation with completion timestamps.
- Known gap queued for later batches: CAD assignment, status changes and QA sign-off; CAD browser acceptance, remaining role surfaces and responsive visual QA.
- Production behavior changed: yes (read-only CAD summary).
- Module boundary deviation: Ticket application/infrastructure and one detail API route plus ticket web/shared response types. No migration. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 36 (Atomic CAD QA sign-off)
- Intent: implement the specification's CAD Lead QA sign-off authority.
- Files touched: src/modules/ticket/application/sign-off-cad.ts, src/modules/ticket/infrastructure/cad-review.repository.ts, src/app/api/tickets/[ticketId]/cad-sign-off/route.ts, src/modules/audit/domain/types.ts, tests/ticket/cad-sign-off.test.ts, CODEX.md.
- Behavior added: visible ticket on an active project with exactly one QA_PENDING CAD record may be signed off by CAD_LEAD. Ticket and CAD records are locked; completion stamps reviewer and completion time and emits both cad.status_changed and cad.qa_signed_off within the route transaction. Field workflow status is preserved, including completed field work. Duplicate/missing records, other CAD states, wrong roles and repeated sign-off fail explicitly.
- Verification: baseline TypeScript and 135 standard tests passed. Final TypeScript, production build and whitespace checks passed; standard suite passed 136 with 31 database skips; PostgreSQL suite passed 165 with 2 dedicated-URL skips. Tests cover role/visibility/project/state gates, duplicate records, update conflicts, real tenant/company isolation, completion metadata, field-state preservation and repeated sign-off. Injected failure of the second audit write rolls back both completion and the first event.
- Known gap queued for later batches: CAD sign-off UI, assignment and status progression, browser acceptance, remaining role surfaces and responsive QA.
- Production behavior changed: yes.
- Module boundary deviation: Ticket application/infrastructure and one new route plus Audit type registration for two event names already defined in CLAUDE.md Section 12. No migration or new event names. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 37 (CAD QA sign-off controls)
- Intent: expose CAD Lead QA sign-off from the ticket's CAD summary.
- Files touched: src/modules/ticket/application/cad-summary.ts, src/app/api/tickets/[ticketId]/route.ts, src/app/ui/request-types.ts, src/app/tickets/[ticketId]/cad-actions.tsx, src/app/tickets/[ticketId]/ticket-detail.tsx, tests/ticket/cad-summary.test.ts, CODEX.md.
- Behavior added: server-derived capability exposes sign-off only to eligible CAD Leads on active-project QA_PENDING records. Confirmation explains reviewer attribution and CAD completion. The form uses the audited endpoint, blocks duplicate/concurrent mutations, surfaces errors and refreshes status/completion date on success.
- Verification: baseline TypeScript and 136 standard tests passed. Final TypeScript, production build and whitespace checks passed; standard suite passed 137 with 31 database skips; PostgreSQL suite passed 166 with 2 dedicated-URL skips. New capability tests cover CAD Lead versus other roles, all CAD states, missing records, company isolation, inactive projects and infrastructure errors. Browser acceptance remains queued.
- Known gap queued for later batches: CAD browser acceptance, assignment/status progression, remaining role surfaces and responsive QA.
- Production behavior changed: yes.
- Module boundary deviation: Ticket application and one detail API route plus ticket web/shared response types. No mutation-policy or migration changes. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 38 (CAD QA browser acceptance)
- Intent: verify CAD Lead sign-off end to end against a disposable PostgreSQL fixture.
- Files touched: CODEX.md.
- Behavior verified: CAD Technician sees Awaiting CAD review without sign-off controls; CAD Lead sees the confirmation and completes QA. Successful sign-off displays Complete and completion date, with no repeat sign-off control. Field work remains Completed.
- Verification: database assertions confirmed reviewer identity, completion timestamp, unchanged field status and exactly one cad.status_changed plus one cad.qa_signed_off event with the CAD Lead actor. TypeScript and standard suite passed (137 pass, 31 database skips). Production unchanged from Batch 37's passing build and 166 PostgreSQL tests. Screenshot retained locally at .local/cad-signoff-verified.png. Preview stopped, disposable database and credential fixture files removed, browser tab closed.
- Known gap queued for later batches: CAD assignment/status progression, remaining role surfaces and responsive QA.
- Production behavior changed: no.
- Module boundary deviation: append-only verification record; concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 39 (Assigned CAD work progression)
- Intent: implement the forward CAD work sequence before Lead QA sign-off.
- Files touched: src/modules/ticket/application/progress-cad.ts, src/modules/ticket/infrastructure/cad-review.repository.ts, src/app/api/tickets/[ticketId]/cad-progress/route.ts, tests/ticket/cad-progress.test.ts, tests/ticket/cad-sign-off.test.ts, CODEX.md.
- Behavior added: assigned CAD Technician or CAD Lead may start NOT_STARTED work and submit IN_PROGRESS work for QA. Explicit action parsing, ticket visibility, active project, ticket/CAD row locks, assignment ownership and expected-state update checks precede a cad.status_changed event in the same transaction. Field state is preserved; progression cannot complete QA or skip states.
- Verification: baseline TypeScript and 137 standard tests passed. Final TypeScript, production build and whitespace checks passed; standard suite passed 139 with 31 database skips; PostgreSQL suite passed 168 with 2 dedicated-URL skips. Tests cover forward progression, wrong roles/assignment, missing visibility, inactive projects, all invalid CAD states, missing/duplicate records and update conflicts. PostgreSQL verifies audit-failure rollback and full start/submit/sign-off sequence with exactly four audit events and unchanged completed field state.
- Known gap queued for later batches: CAD progression controls and assignment/activation, browser acceptance, remaining role surfaces and responsive QA.
- Production behavior changed: yes.
- Module boundary deviation: Ticket application/infrastructure plus one new ticket API route; no migration or new audit event names. Concurrent sample/configuration changes excluded.

### 2026-09-25 - Batch 40
- Intent: expose assigned CAD progression controls on ticket details.
- Files touched: src/modules/ticket/application/cad-summary.ts; src/modules/ticket/infrastructure/cad-summary.repository.ts; src/app/api/tickets/[ticketId]/route.ts; src/app/tickets/[ticketId]/cad-actions.tsx; src/app/tickets/[ticketId]/ticket-detail.tsx; src/app/ui/request-types.ts; tests/ticket/cad-summary.test.ts; CODEX.md.
- Behavior added: assigned CAD Technician or CAD Lead can start work and submit it for QA using server-derived capabilities; other users, incompatible states and inactive projects receive no progression control. Existing transactional commands remain authoritative and field status is unchanged.
- Validation: baseline TypeScript and 139 tests passed (31 skipped); final TypeScript and 140 tests passed (31 skipped); PostgreSQL suite passed 169 tests (2 dedicated-URL skips); production build passed; git diff --check passed.
- Boundary deviation: ticket detail API/UI and shared request response type updated to expose ticket-module capabilities; no other module changed.
- Known gap queued for later batches: browser acceptance for progression controls; CAD assignment/activation remains required before new CAD records can enter NOT_STARTED.
- Production behavior changed: yes

### 2026-09-25 - Batch 41
- Intent: connect new CAD records to the work progression with transactional initial assignment and activation.
- Files touched: src/modules/ticket/application/activate-cad.ts; src/modules/ticket/application/ports.ts; src/modules/ticket/infrastructure/cad-review.repository.ts; src/modules/ticket/infrastructure/ticket.repository.ts; src/app/api/tickets/[ticketId]/cad-activate/route.ts; tests/ticket/cad-activation.test.ts; tests/ticket/cad-sign-off.test.ts; CODEX.md.
- Behavior added: CAD Lead activates an unassigned NOT_REQUIRED record into NOT_STARTED, selecting an active project CAD Technician or Lead who can see the ticket under company isolation. Active project required; drafts, rejected and canceled tickets cannot activate CAD. Field-completed tickets remain eligible for their independent CAD work. Assignment and existing cad.status_changed event are atomic. Repeated activation and ambiguous records fail closed.
- Implementation assumption: specification names CAD roles but does not explicitly assign activation authority; initial activation uses CAD Lead authority. No new role or audit event added.
- Validation: baseline TypeScript and 140 tests passed (31 skipped); final TypeScript and 142 tests passed (31 skipped); PostgreSQL suite passed 171 tests (2 dedicated-URL skips), including activation-to-sign-off sequence, inactive/wrong-role assignees, isolation, repeat activation, and audit rollback; production build passed; git diff --check passed.
- Boundary deviation: one new ticket API route added to wire the ticket application command.
- Known gap queued for later batches: CAD assignee picker and activation UI; browser acceptance for progression and activation; CAD reassignment.
- Production behavior changed: yes

### 2026-09-25 - Batch 42
- Intent: expose CAD assignment/activation and verify the full CAD browser workflow.
- Files touched: src/modules/tenancy/application/cad-assignees.ts; src/modules/tenancy/infrastructure/cad-assignees.repository.ts; src/modules/ticket/application/cad-options.ts; src/app/api/tickets/[ticketId]/cad-activate/route.ts; src/app/api/tickets/[ticketId]/route.ts; src/app/tickets/[ticketId]/assignment-actions.tsx; src/app/tickets/[ticketId]/cad-actions.tsx; src/app/tickets/[ticketId]/ticket-detail.tsx; src/app/ui/request-types.ts; tests/ticket/cad-options.test.ts; tests/ticket/cad-sign-off.test.ts; CODEX.md.
- Behavior added: Lead-only activation capability and searchable paginated CAD picker; candidates require an active project membership as Technician or Lead, active user, tenant scope and ticket company access. Existing picker reused; required selection, loading/error states and shared action locking retained.
- Validation: baseline TypeScript and 142 standard tests passed; final TypeScript and 144 standard tests passed (31 skips); PostgreSQL suite passed 173 tests (2 dedicated-URL skips); production build and diff checks passed. Candidate tests cover tenant/project boundaries, company isolation, inactive users, literal search, authorization and pagination validation.
- Browser acceptance: isolated synthetic database; missing-assignee error, candidate search, Lead assignment to Technician, Lead cannot start another user's work, Technician start and submit, Technician has no QA control, Lead confirms completion. DB readback verified correct assignee/reviewer/timestamp, unchanged field COMPLETED status, exactly four cad.status_changed plus one cad.qa_signed_off. Preview server stopped and fixture DB/files removed; screenshot retained locally at .local/cad-full-workflow.png.
- Boundary deviation: coordinated tenancy candidate service/repository plus ticket orchestration and UI; two ticket routes updated together for candidate GET and detail capability response. No concurrent agent writes.
- Known gap queued for later batches: CAD assignee/reviewer display names and reassignment; wider help-flag/admin surfaces and responsive acceptance remain.
- Production behavior changed: yes

### 2026-09-25 - Batch 43
- Intent: identify CAD ownership and QA reviewer on request details.
- Files touched: src/modules/ticket/application/cad-summary.ts; src/modules/ticket/infrastructure/cad-summary.repository.ts; src/modules/tenancy/application/ticket-labels.ts; src/modules/tenancy/infrastructure/ticket-labels.repository.ts; src/app/api/tickets/[ticketId]/route.ts; src/app/tickets/[ticketId]/ticket-detail.tsx; src/app/ui/request-types.ts; tests/ticket/cad-summary.test.ts; tests/ticket/cad-options.test.ts; tests/tenancy/request-options.test.ts; CODEX.md.
- Behavior added: CAD panel shows assigned worker (or Not assigned) and recorded QA reviewer. CAD read model includes reviewer ID; existing tenancy label service resolves both names only within the ticket tenant, including historical deactivated users. Missing referenced names fail explicitly.
- Validation: baseline and final TypeScript and 144 standard tests passed (31 skipped); PostgreSQL suite passed 173 tests (2 dedicated-URL skips), with added assertions for persisted CAD user IDs, cross-tenant name rejection and historical names after user deactivation/project archival; production build and diff checks passed.
- Boundary deviation: coordinated ticket read model, tenancy label service and ticket API/UI changes needed to resolve names without direct cross-module table access.
- Known gap queued for later batches: CAD reassignment; help-flag and admin surfaces; responsive acceptance. This display-only increment was build/type/database verified; no additional browser run.
- Production behavior changed: yes

### 2026-09-25 - Batch 44
- Intent: expose crew help flags through a survey-role project board.
- Files touched: src/modules/ticket/application/help-board.ts; src/app/api/projects/[projectId]/help-flags/route.ts; src/app/api/tickets/route.ts; src/app/project/[projectId]/requests/request-list.tsx; src/app/project/[projectId]/help/page.tsx; src/app/project/[projectId]/help/help-board.tsx; tests/ticket/help-board.test.ts; CODEX.md.
- Behavior added: project requests link to help board for survey roles; board lists only repository-authorized active flags and exposes server-derived raise level, own-clear, and same-crew escalation hints. Optional reasons and confirmations call existing transactional mutations. Missing crew, duplicate flag, empty workload, existing escalation and unauthorized-role cases suppress inappropriate actions. API now explicitly denies unrelated roles on board reads.
- Validation: baseline TypeScript and 144 standard tests passed; final TypeScript and 147 standard tests passed (31 skipped); PostgreSQL suite passed 176 tests (2 dedicated-URL skips); production build and diff checks passed. New capability tests cover ownership, crew, workload, duplicate escalation, inactive project, role denial and propagated infrastructure failures.
- Boundary deviation: ticket presentation changes span two API routes (board and navigation capability) and project UI, documented as one coordinated feature.
- Known gap queued for later batches: help-board browser acceptance, raiser display names, flagged ticket/crew selector for voluntary pickup; existing backend disallows empty-workload Level 2 flags despite specification allowing general overload signals; CAD reassignment and admin surfaces remain.
- Production behavior changed: yes

### 2026-09-25 - Batch 45
- Intent: identify help flag raisers and verify board actions in the browser.
- Files touched: src/modules/ticket/application/help-flags.ts; src/modules/ticket/infrastructure/help-flag.repository.ts; src/app/project/[projectId]/help/help-board.tsx; src/app/ui/api.ts; tests/ticket/help-board.test.ts; tests/ticket/help-flags.test.ts; tests/ticket/request-ui.test.ts; CODEX.md.
- Behavior added: visible help flags include the raiser's name from the existing tenant-scoped raiser join; board renders the name. Browser testing found login return-path allowlist missing the new help route; added only that route, retaining rejection of external destinations and query injection.
- Validation: baseline/final TypeScript and 147 standard tests passed (31 skips); PostgreSQL suite passed 176 tests (2 dedicated-URL skips), including visible names and cross-tenant/historical-user assertions; production build and diff checks passed.
- Browser acceptance: synthetic IM raised Level 1 with reason; own-clear shown and duplicate raise hidden; unrelated PC saw no Level 1; responsible PC escalated with reason and could clear only own Level 2; original Level 1 remained and repeat escalation was hidden. Rebuilt preview confirmed login returns to help route. Database verified exactly raised/escalated/cleared events, correct raiser and separate active/cleared states. Isolated database/server/fixture files removed; local screenshot .local/help-board-cleared.png retained.
- Boundary deviation: shared UI return-path helper changed to fix the concrete navigation bug.
- Known gap queued for later batches: voluntary pickup selector; general overload Level 2 with empty workload; CAD reassignment and admin surfaces.
- Production behavior changed: yes

### 2026-09-25 - Batch 46
- Intent: make voluntary pickup of Level 2 flagged work available from the help board.
- Files touched: src/modules/ticket/application/help-pickup-options.ts; src/modules/ticket/infrastructure/help-pickup.repository.ts; src/modules/ticket/application/help-board.ts; src/modules/tenancy/application/assignment-candidates.ts; src/modules/tenancy/infrastructure/assignment-candidates.repository.ts; src/app/api/projects/[projectId]/help-flags/route.ts; src/app/project/[projectId]/help/help-board.tsx; src/app/project/[projectId]/help/pickup.tsx; tests/ticket/help-pickup-options.test.ts; tests/ticket/help-flags.test.ts; CODEX.md.
- Behavior added: other Party Chiefs can open pickup on visible Level 2 flags; paginated/searchable request choices are restricted to the original flag snapshot, current flagged-chief assignment, active statuses/project, tenant/company access and active Party Chief membership. Instrument Man choices use active project membership and the claimant's active roster. Required selections call the existing atomic claim command; shared board controls are disabled during pickup and refreshed after success.
- Validation: baseline TypeScript/147 standard tests passed; final TypeScript/149 standard tests passed (31 skips); PostgreSQL suite passed 178 tests (2 dedicated-URL skips); production build and diff checks passed. New unit tests cover role/visibility/own-flag rejection, query bounds, pagination and crew scoping. Database tests cover candidate numbers, own roster, literal search, tenant denial, and disappearance after claim/auto-clear.
- Boundary deviation: coordinated ticket query/UI with optional crewChiefId in tenancy candidate service; one existing API route extended.
- Known gap queued for later batches: browser acceptance of pickup; general-overload Level 2 empty-workload support; delayed workload coverage review; CAD reassignment and admin surfaces.
- Production behavior changed: yes

### 2026-09-25 - Batch 47
- Intent: browser acceptance of voluntary pickup and automatic help-flag clearing.
- Files touched: CODEX.md only.
- Browser acceptance: isolated two-crew fixture with linked Level 1/Level 2 flags; unrelated Party Chief sees Level 2 only, pickup selector offers flagged request FSS-A1-HF01 and only own IM2, missing selections produce a validation message, confirmation refreshes to no active flags, request becomes visible in new chief's request list, and detail displays PC2/IM2 with IN_PROGRESS preserved.
- Database verification: both flags CLEARED with TICKETS_REASSIGNED; correct new PC/IM; exactly one ticket.assigned, one help_flag.ticket_claimed and two help_flag.cleared events. Fixture flags were seeded directly, so counts exclude setup events.
- Validation: TypeScript and 149 standard tests passed (31 skipped); used previously verified production build from Batch 46 with no source changes. Preview server stopped and synthetic database/scripts removed; screenshot .local/help-pickup-verified.png retained locally.
- Known gap queued for later batches: general-overload Level 2 empty-workload support; delayed workload coverage; CAD reassignment and admin surfaces.
- Production behavior changed: no

### 2026-09-25 - Batch 48
- Intent: include delayed field work in help-flag load balancing under CLAUDE.md Sections 6 and 10.
- Files touched: src/modules/ticket/infrastructure/help-flag.repository.ts; src/modules/ticket/infrastructure/help-pickup.repository.ts; tests/ticket/help-flags.test.ts; CODEX.md.
- Behavior added/changed: DELAYED tickets participate in Level 1/2 snapshots, unresolved-work checks, voluntary pickup choices, and guarded claims. Pickup preserves DELAYED status and uses existing transactional assignment/claim/clear audit writes.
- Verification: baseline TypeScript passed and pnpm test passed (149 pass, 31 database skips). Final pnpm tsc --noEmit passed; pnpm test passed (149 pass, 32 database skips); PostgreSQL suite passed (179 pass, 2 dedicated-URL skips). Integration coverage exercises both IN_PROGRESS and DELAYED through raise, escalation, visibility, pickup, and auto-clear; completed and all canceled states reject pickup. Tenant and subcontractor isolation coverage retained.
- Known gaps queued for later batches: general-overload Level 2 flags without ticket snapshots; CAD reassignment; remaining planned operational surfaces.
- Module boundary deviations: none; CODEX.md append only. Unrelated local changes preserved.
- Production behavior changed: yes.

### 2026-09-25 - Batch 49
- Intent: support the specified general-overload Level 2 help signal with no assigned ticket snapshot.
- Files touched: db/migrations/024_general_help_flag_events.sql; src/modules/ticket/application/help-flags.ts; src/modules/ticket/application/help-board.ts; src/modules/ticket/infrastructure/help-flag.repository.ts; src/modules/audit/domain/types.ts; src/modules/audit/infrastructure/audit.repository.ts; tests/ticket/help-flags.test.ts; tests/ticket/help-board.test.ts; CODEX.md.
- Behavior added/changed: Party Chiefs can raise or escalate a general Level 2 signal with an empty snapshot. Such flags require manual clearing and do not offer pickup. Level 1 still requires assigned workload. Subcontractor viewers can see general flags from their own company; other-company isolation remains enforced.
- Audit/migration: migration 024 permits a null ticket reference only for raised/escalated/cleared events referencing an existing empty Level 2 flag in the same tenant and project. Existing live-ticket/tombstone checks and append-only protections remain. The audit write accepts the nullable reference; no new event names. Applied to the configured development database and rerun twice inside a rolled-back transaction.
- Verification: baseline TypeScript and pnpm test passed (149 pass, 32 skips). Final TypeScript and production build passed; pnpm test passed (151 pass, 32 database skips); PostgreSQL suite passed (181 pass, 2 dedicated-URL skips). Tests cover general raise/clear audit records, duplicate and unauthorized clearing rejection, audit failure rollback, cross-tenant/project/flag reference rejection, company visibility, empty-workload escalation, and absence of pickup. Browser acceptance of the newly enabled action is queued.
- Module boundary deviations: two Audit module type declarations updated for the required nullable ticket reference; migration and tests directly support the Ticket module change. Unrelated local work preserved.
- Known gaps queued for later batches: general-overload browser acceptance; CAD reassignment; remaining planned operational surfaces.
- Production behavior changed: yes.

### 2026-09-25 - Batch 50
- Intent: browser acceptance for general-overload help flags added in Batch 49.
- Files touched: CODEX.md only; local screenshot retained outside the commit.
- Verification: production preview used an isolated synthetic database migrated through 024. PC2, with no assigned requests, signed in via help-board return link and raised a Level 2 flag with a reason. Own flag displayed zero recorded requests and Clear flag, with no duplicate raise action. PC1 saw PC2's name/reason/empty workload with neither pickup nor clear controls. PC2 manually cleared the flag; the board became empty and raising was available again. Database readback confirmed CLEARED / MANUALLY_CLEARED, empty snapshot, and exactly one help_flag.raised plus one help_flag.cleared event, both with null ticket_id.
- Checks: pnpm tsc --noEmit passed; pnpm test passed (151 pass, 32 database skips). Used successful Batch 49 production build. Preview stopped, browser tab closed, isolated database dropped, temporary credential files removed. Screenshot: .local/general-overload-verified.png (local only).
- Known gaps queued for later batches: review CAD reassignment requirements against source specifications; remaining planned operational surfaces and responsive acceptance.
- Production behavior changed: no.
