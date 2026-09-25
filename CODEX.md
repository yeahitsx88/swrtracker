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
