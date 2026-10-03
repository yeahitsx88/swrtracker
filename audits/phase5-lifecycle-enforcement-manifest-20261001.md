# Phase5 lifecycle enforcement manifest

Date: 2026-10-01. Authoritative branch: phase5. Storage baseline030a654.
Owner approved scoped implementation; Tasks3–7 remain release gates.

## Access boundary and evidence

Project operational access requires a same-tenant, globally active user, effective project membership and actual operational role. Independent Project Admin grants compose with operational roles, require an eligible GC/OWNER_REP company and cannot bypass project disablement. Central IT is a separate eligible tenant authority. Its support exception applies to administration and redacted delivery diagnostics; it does not fabricate ticket-content or Manager workflow authority. Archived projects retain evidence and existing read-only behavior; archived status never bypasses effective membership checks.

Source inventory: rg -l 'project_memberships|tenant_memberships|deactivated_at|session_version' src, augmented with rg -l 'deactivatedAt|accessDisabledAt' src. Rows below classify every current direct SQL consumer and additional application/type consumer. Existing tests listed are regression evidence; mocked SQL does not verify PostgreSQL semantics.

Real SQL evidence: tests/beta/project-capabilities-postgres.ts runs inside the rollback-only unique-schema fixture from tests/beta/account-offboarding-postgres.ts. It verifies combined Manager/admin, legacy admin revocation, disabled access, cached Manager denial, workforce context, staffing snapshot/member/Chief access, ticket assignment eligibility, retained disabled protected-person and Area diagnostics, disabled Manager denial, My Account assignments, project discovery and deduplicated eligible escalation recipients. Schema acceptance separately verifies28 storage invariants and original history preservation.

## Direct consumers

Paths below are repository-relative. Mutation coordination is tracked separately; effective read/assignment eligibility does not establish a concurrency barrier.

| Consumer | Entry point and access treatment | Verification and next gate |
| --- | --- | --- |
| src/lib/project-capabilities.ts | Fresh account/version, same tenant, independent grants, eligible Central IT, effective membership | project-capabilities.test.ts8 cases; project-capabilities-postgres.ts |
| src/lib/get-project-role.ts | Operational prelude; globally/local active, actual role, retained legacy admin requires active grant | project-capabilities-postgres.ts; ticket visibility regression |
| src/lib/get-tenant-role.ts | Tenant administrative prelude; globally active eligible tenant administrator | get-tenant-role.test.ts; Task3 postwait auth |
| src/lib/access-administrator.ts | Project company/invite/grant actor; current combined capabilities | project-capabilities.test.ts; Task3 write barrier |
| src/lib/project-insight-auth.ts | Actual Manager semantics retained; explicit Central/local administrative diagnostics | local-preview.test.ts; Task5 scoped parity |
| src/lib/auth.ts | Session decoding, logout denylist and user/version validation | session-auth.test.ts; Task3 entry-point and postwait checks |
| src/lib/survey-review-authority.ts | Fresh actual Manager; Superintendent grant requires effective membership | project-capabilities-postgres.ts; assessment-authorization.test.ts |
| src/lib/ticket-visibility-clause.ts | Effective actual role from project context; subcontractor company grant also checks local access | visibility-repository.test.ts; Task7 SQL HTTP coverage |
| src/app/api/projects/get-handler.ts | Discovery excludes local/global inactive and revoked legacy admin | project-capabilities-postgres.ts; project-list-route.test.ts; Task6 administered-project metadata |
| src/app/api/projects/[projectId]/members/route.ts | Operational member selector excludes local/global inactive | add-project-member-security.test.ts; Tasks3/5 transaction and capability parity |
| src/app/api/tickets/[ticketId]/attachments/handler.ts | Effective operational context before download; upload SQL rechecks local/global activity/version | attachment-read-route.test.ts; Task3 upload reauthorization; Task7 HTTP denial |
| src/app/api/ops/diagnostics/handler.ts | Existing tenant support diagnostics | Task5 diagnostics_query_is_project_partitioned; Task3 entry-point auth |
| src/modules/identity/infrastructure/company-access.repository.ts | Requester candidates/new company grants require effective membership; historical audit retained | company-access-overview.test.ts; Task3 invitation/grant writes |
| src/modules/identity/infrastructure/user.repository.ts | Historical identity lookup preserves attribution; registration creates membership; reset/deactivate changes account | identity-auth.test.ts; Tasks3/4 reset/register/global disable |
| src/modules/notification/infrastructure/index.ts | Current Manager/admin recipients effective/active; Central eligible/active; deduplicated; actual legacy admin fallback distinct from recipients | project-capabilities-postgres.ts; timeout-and-vacancy.test.ts; Task3 worker writes |
| src/modules/notification/application/local-preview.ts | Stored transport history preserves attribution; current insight authority; admin responses redact ticket content | local-preview.test.ts; Task3 reauthorization |
| src/modules/tenancy/infrastructure/my-account.reader.ts | Profile globally active; Area/crew requires actor/partner effective membership; stored links retained | project-capabilities-postgres.ts |
| src/modules/tenancy/infrastructure/protected-obligations.repository.ts | Retained subjects truthful active flags; effective candidates; independent IT authority; grant witness locked/rechecked; snapshot local stamps | project-capabilities-postgres.ts; protected-obligations-command.test.ts; Task3 tenant-first |
| src/modules/tenancy/infrastructure/superintendent-areas.repository.ts | Truthful diagnostics; actual effective Manager; effective replacement witnesses; inactive subject cannot confirm | project-capabilities-postgres.ts; superintendent-area-command.test.ts; Task3 tenant-first |
| src/modules/tenancy/infrastructure/superintendent-crews.repository.ts | Chief/Superintendent joins require effective active membership | superintendent-cohort.test.ts; Task7 seeded linked-crew SQL |
| src/modules/tenancy/infrastructure/survey-staffing.repository.ts | Effective actors/subjects, retained inactive roster/reporting flags; snapshot stamps/admin grants | project-capabilities-postgres.ts; survey-staffing tests; Task3 writes |
| src/modules/tenancy/infrastructure/survey-teams.repository.ts | Effective candidates/Manager; inactive historical flags; role update cannot alter disabled membership | project-capabilities-postgres.ts; survey-teams tests; Task3 writes |
| src/modules/tenancy/infrastructure/survey-workforce.repository.ts | Effective actor/population/Chief witnesses; same-tenant current version | project-capabilities-postgres.ts; survey-workforce.test.ts; Task3 writes |
| src/modules/tenancy/infrastructure/tenancy.repository.ts | Activation witnesses effective/globally active; memberships/assignments retained | project-capabilities-postgres.ts; project-activation.test.ts; Tasks3/5 writers |
| src/modules/ticket/application/draft-access.ts | Locked actual Requester or independent Project Admin; Central alone no draft recovery | project-capabilities-postgres.ts; draft-recovery.test.ts; Task3 barrier |
| src/modules/ticket/application/recover-draft.ts | Recipient Requester globally/local active; original authors/draft data retained | draft-recovery.test.ts; Task3 barrier |
| src/modules/ticket/infrastructure/ticket.repository.ts | Effective assignment/company-grant/direct-authority; common context prevents disabled visibility; history retains attribution | project-capabilities-postgres.ts; visibility-repository.test.ts; Task3 writes |

## Additional application and type consumers

| Consumer | Classification |
| --- | --- |
| src/modules/identity/application/authenticate.ts | Login global deactivation; Task3 login/reset coordination |
| src/modules/identity/domain/types.ts | Retained global user state; no independent authorization |
| src/modules/tenancy/domain/types.ts | Retained duty/assignment state; no independent authorization |
| src/modules/tenancy/application/ports.ts | Repository contracts; Task3 effective subject checks on duty writers |
| src/modules/tenancy/application/protected-obligations.types.ts | Separate accessDisabledAt; independent admin grant witness |
| src/modules/tenancy/application/resolve-survey-reviewer.ts | Fresh subject/replacement local inactivity refuses before coverage/revoke/audit |
| src/modules/tenancy/application/unlink-superintendent-area.ts | Fresh subject/replacement local inactivity refuses before unlink/audit |
| src/modules/tenancy/application/add-department-member.ts | Retains department links; Task3 effective subject writer validation |
| src/modules/tenancy/application/assign-aor-user.ts | Retains Area links; Task3 effective subject writer validation |
| src/modules/tenancy/application/assign-aor-department.ts | Shared department duties preserved; Task3 coordinated writes |

No current search result is uncategorized. Reconcile every added consumer here before release.

## Remaining transaction and release gates

Task3 must acquire tenant row locks before domain/replay locks for every lifecycle-relevant writer and revalidate account/version/logout/authority after waits. Exclusive writes must not upgrade a shared lock. Task4 introduces previews/transitions/reviews/outbox. Task5 completes local parity without tenant escalation. Tasks6/7 verify UI and all cases with real races, HTTP/browser evidence. This manifest classifies access treatment; it does not authorize partially enforced deployment.
## Task3 writer coordination verified to date

| Writer entry point | Held tenant mode / post-wait enforcement | Actual SQL evidence |
| --- | --- | --- |
| Project member POST; tenant membership POST/DELETE | EXCLUSIVE; fresh cookie/logout/account/version and current eligible Central IT before writes | project-member-atomic-postgres.ts; account-offboarding-concurrency-postgres.ts (continuity primitive race, not tenant endpoint race) |
| Initial registration; reset issuance/completion; logout | EXCLUSIVE before invite/account/token locks; token scope peek is nonlocking; disabled account refuses reset; bearer rechecked after wait | identity-lifecycle-atomic-postgres.ts (rollback/preservation); session primitives two-client race |
| Staffing POST | EXCLUSIVE selected upfront because role changes can revoke sessions; current bearer, operational role and actual Manager checked before ledger | lifecycle-writer-handlers-postgres.ts staffing-role-and-links |
| Staffing PATCH targeted link unlink | EXCLUSIVE authority/visibility links; current bearer/actual Manager before ledger | lifecycle-writer-handlers-postgres.ts staffing-unlink |
| Teams POST/DELETE; role PATCH | SHARED organizational writes; EXCLUSIVE role changes; current bearer/actual Manager before ledger | lifecycle-writer-handlers-postgres.ts team-save/team-delete/team-role |
| Protected reviewer resolution POST | EXCLUSIVE authority-grant mutation; bearer before context locks, again before ledger; current Central/project-admin/Manager authority retained | lifecycle-writer-handlers-postgres.ts protected-review-handover |
| Superintendent Area unlink PATCH | EXCLUSIVE Area coverage authority; bearer before context locks and after domain wait before ledger; actual Manager | lifecycle-writer-handlers-postgres.ts superintendent-area-unlink |
| Workforce move POST | EXCLUSIVE roster-based visibility; bearer before role/domain locks; current operational viewer/move authority before ledger | lifecycle-writer-handlers-postgres.ts workforce-roster-move |

The new handler race script creates a unique fully migrated owned schema, uses two actual clients plus pg_blocking_pids, commits a synthetic account disablement while the handler waits, then proves401, selected lock mode and no domain/audit/ledger changes.40 checks cover eight real handlers; no public offboarding command exists yet.

Remaining writer families include ticket workflow/assignment/create/draft/attachments, setup/configuration/activation/archive, departments/titles/members, generic Area assignments, invitation issuance/company authority, shared templates/company/project creation, notification/read-state and relevant workers. Direct and indirect repository writers still need a complete entry-point inventory and each-family races before Task3 closes. Administrative audit coverage is currently bounded to the verified Task3 identity/membership slice; existing non-ticket events retain their own provenance contracts.
## Checkpoint continuation: metadata and ticket writers
- EXCLUSIVE: Department membership/title/configuration, Area assignments and structure, activation/archive, request configuration, invitation/company-authority writes, company/project creation, shared template writes and whitelist writes.
- Each mutation acquires the tenant barrier and rereads current bearer and action authority on the held client before domain effects. Existing operational roles are not replaced by administrative capabilities.
- SHARED:24 ticket transition/update callbacks through withTicketMutation; creation and draft deletion/recovery use explicit coordination on the held client. Fresh operational role and visibility precede replay.
- Actual default entrypoint concurrency acceptance:31 handlers /155 race assertions plus5 atomic department audit assertions (160 total). Subject departure, action-specific positive authorization, attachments/downloads, workers, complete indirect writer search and integrated offboarding races remain open; this is not a complete enforcement inventory.

## Task3 attachment continuation
- Uploads (keyed and unkeyed) and downloads: SHARED tenant barrier and fresh held-client role/visibility through withTicketMutation. Download attachment lookup and successful audit share that client; audit failure withholds buffered bytes.
- lifecycle-writer-handlers-postgres.ts now verifies34 distinct handler entrypoints /40 wait-and-revoke scenarios, with attachment global-disable/version/logout races and positive upload/replay/download/audit rollback.228 total assertions, not a full release proof.
- Remaining worker search confirms orphan recovery currently escalates only, following approved A3; no automatic reassignment is to be restored. Worker candidate freshness, recipient eligibility/audit ordering, other read-state mutations and complete indirect inventory still require classification and proof.

## Task3 notification worker continuation
- Both notification worker entrypoints use withTenantNotificationTransaction: SHARED tenant lock in a caller-owned transaction; discovery never dispatches cached recipients, all three candidate families reread bounded SQL on the held client.
- Actual default helper/application/repository/job-run integration: three observed wait-and-disable races, positive recipient/dedup checks, preserved orphan assignments and a second tenant's SQL exclusion;40 isolated PostgreSQL assertions.
- A3 remains escalation-only. These workers append existing operational signals, never assign duties or restore disabled access. External email transport is not transactional; existing delivery/provider and configured system-actor gates remain separate evidence limits.
- Next: effective subject validation for Area/department/duty writers and full direct/indirect mutation classification. Task3 is not complete.

## Task3 effective duty subject continuation
- Area user assignment and department add/title/move use the held-client active project subject lookup, bounded by tenant/project/user, global and local disablement and effective company-role eligibility. Assignment rejection precedes old Area link replacement.
- Inactive department membership rows remain historical: title/move refuse them; inactive actor department scope confers no title authority. Unlink-only resolution remains available under existing authorization.
- active-duty-subject-postgres.ts:57 assertions, eight observed real wait-and-disable races plus current-subject, cross-tenant, subcontractor and inactive department checks.491 normal tests, strict types and build pass.
- Task3 writer inventory and remaining family proofs are still open; this does not certify full enforcement or deployment.

## Task3 notification operator continuation
- Project notification POST capture/retry: SHARED tenant barrier, current session and current insight role reread on held client before delivery bookkeeping. Read-only GET remains current-auth/project bounded.
- Actual SQL harness now277 assertions across36 entrypoints and46 revocation scenarios, plus4 permission-only local-disable/role-loss waits. Both positive actions work; missing project preserves state. Capture is local delivery bookkeeping, not proof of external email atomicity.
- Owner requested checkpoint and stop. Task3 complete indirect inventory/remaining subject and family proofs, Tasks4-7 and final branch review remain pending.


## Task3 closure — 2026-10-02

Owner resumed the approved plan. The exhaustive application SQL writer classification is [phase5-lifecycle-writers.json](phase5-lifecycle-writers.json):39 production source paths, direct and indirect. `tests/identity/lifecycle-inventory.test.ts` scans multiline INSERT/UPDATE/DELETE statements across production TypeScript and fails for uncategorized paths or stale missing files. This supplements the semantic entry-point audit; a filename inventory alone does not prove caller coordination.

- Ordinary ticket creation and24 mutation callbacks, draft creation/edit/delete/recovery, attachment upload/download and ticket history/notification/audit effects remain behind SHARED held-client coordination. Fresh token/logout/account/version, operational role and visibility precede replay. SQL recipients and new assignees require same-tenant effective current membership.
- Identity registration/reset/logout, tenant/project membership, whitelist, configuration/activation/archive, departments/titles/Area metadata, staffing and protected handovers, invitations/company authority, independent grants/company association/template selection and both offboarding scopes use EXCLUSIVE for authority/session changes. Actual action authority is reread after lock waits, before saved responses.
- Duty subject validation covers global/local disablement, company eligibility and retained inactive department rows. New membership insertion checks effective account/company before session/audit effects and cannot overwrite an existing operational role. Last eligible Central IT and distinct actual Survey Manager invariants are enforced; acting/designated authority is not a replacement.
- Notification worker/capture/retry and administrative-review delivery use SHARED coordination and current recipient eligibility. Workers escalate orphaned work, never reassign it. Administrative reviews, recipient deduplication and stable outbox leases preserve local/global scope.
- Security rate counters, expiry pruning, worker telemetry and postcommit encrypted reset delivery are classified separately: they confer no authority, restore no session and create no operational duty. Repository-only event/ledger helpers require their documented caller-held transaction; they have no standalone production entry point.
- Company type/account-company, CAD/help-flag/legacy Area mutation and unrestricted owner SQL have no supported production writer in this increment. Existing retained live relationships are explicit blockers, including unsupported cleanup paths; offboarding refuses rather than guessing a reassignment. Manual operational SQL must follow tenant-first coordination; unrestricted owner SQL is outside application enforcement.

The actual default-handler harness now passes322 assertions with observed waits and rejection before writes, audit or replay, supplemented by57 subject-writer assertions/eight real global/local races,33 two-client primitive/continuity checks,76 command atomicity/replay checks,44 policy checks and the integrated HTTP/browser matrix. The notification recipient insert regression verifies no newly disabled recipient can be enqueued indirectly. All39 SQL paths are categorized; there is no open application writer-family category.

Whole-range review additionally closed action-specific ticket replay authority and effective subcontractor assignee eligibility. All16 keyed workflow actions now lock the ticket, freshly resolve and recheck visibility after any assignment wait, then check current action role/relationship before cached response replay. Cleared field-review duties permit only the exact actor's completed successful command with current qualifying role; new live reviewers take precedence. Real PostgreSQL proof:16 route assertions,13 regular/direct company eligibility assertions and5 observed two-client ticket-wait assertions.

Task3 is closed for the approved application boundary. Tasks4–6 consume that completed barrier. [Final acceptance](phase5-scoped-offboarding-acceptance-20261002.md) covers A01–A40/P01–P15 and distinguishes application proof from pilot/deployment gates. This closure does not certify unrestricted database-owner writes, provider exactly-once delivery or a mixed old/new rollout.


## Rehearsal-discovered guarded manager appointment (2026-10-02, Decision45)
GET/POST /api/projects/[projectId]/survey/manager-handover calls appoint-survey-manager and survey-manager.repository. An EXCLUSIVE authenticated transaction revalidates scoped administration before every replay. Current active same-tenant/project, non-subcontractor manager and two Superintendents are required; protected duties block transfer. Explicit Area/reporting history, role/version, administrative event and ledger commit atomically. No ticket, file, crew or membership deletion.

Evidence: operations/manager-handover-guardrails.json (six checks: confirmation, actor denial, tenant isolation, stale state, complete audit-failure rollback and observed writer-barrier wait); manager-handover-browser.json (confirmed live UI, mobile width and two session revocations); survey-manager-departure.json (nine checks: current-authority replay denial, concurrent exact replay, retained history and separate project/tenant disable with actual continuity). Five normal tests cover parsing, fresh/stale/blocked dispatch and identical preview/command checksum binding. New writer classified without changing existing dispositions.
