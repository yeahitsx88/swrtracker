# Survey Manager Team Management — bounded V1 increment

## Authority and sequence

Owner brief: `C:/Users/xwall/.codex/attachments/c9e3ea04-6caf-4df2-9672-f969d815db2e/Pasted text.txt`, received 2026-09-30. Finish the current clean checkpoint, then prioritize this increment. This expands Decision 12's earlier Party Chief/Instrument Man-only staffing flow; it does not authorize a general RBAC editor, account invitations, cross-project discovery, or tenant-permission changes. The earlier KPI/performance objective remains unfinished, not replaced or declared complete.

## Required outcomes and acceptance evidence

| Requirement | Evidence required before claiming completion |
|---|---|
| Manager-only Team Management menu/page | Actual Manager navigation and rendered page; direct route/API denial for other roles and out-of-project users |
| Project personnel with name, email and survey role | Tenant/project-scoped read API and UI; no duplicate underlying identities or deactivated users offered for assignment |
| Assign/edit/change/remove Superintendent, Party Chief and Instrument Man roles | Authorized atomic mutations, explicit role-change confirmation, session invalidation, invalid-role/tenant/project tests; no changes to tenant membership |
| Named teams with Area, lead and members | Reuse existing project AOR nodes and user IDs; persisted model and API tested against PostgreSQL |
| Lead belongs to the team and role remains visible | Server validation plus UI; reject removing the lead until another lead is designated |
| Available/currently assigned/assigned elsewhere personnel | Consistent scoped list/search and bounded pagination; labels match the approved membership policy |
| View/edit team name, Area, lead and members | Current-data UI and successful/rejected HTTP transactions; stale-write conflict and audit rollback coverage |
| Delete team safely | Explicit confirmation, soft-deactivation consistent with current staffing conventions, append-only audit; no account or historical ticket deletion |
| Preserve assignment/history and references | No rewritten ticket assignment snapshots/events; no dangling active-team references after role removal/deletion |
| Authorization/isolation | Wrong tenant/project, forged person/Area/lead IDs, wrong role, revoked/stale session and archived-project tests |
| UX and non-regression | Axiom/Impeccable existing Operate identity; loading/error/empty/mobile/keyboard checks, typecheck, full tests and production build |
| Completion checkpoint and handoff | Exact commit/branch; schema/auth/tests/assumptions/decisions/deferred items and next logical development point reported |

## Authoritative repository evidence at inspection

- `db/migrations/001_initial_schema.sql`: `project_memberships` is unique on `(project_id, user_id)` with one `role` column. There is no independent survey-role assignment table. Later migrations extend role values, not this cardinality.
- `src/lib/get-project-role.ts`: that membership role controls project authorization. Reusing it for promotion/demotion changes project operational permissions; it must never change tenant-level permissions. Do not present survey-role changes as cosmetic labels.
- `src/app/api/projects/[projectId]/members/route.ts` and `tenancy/application/add-project-member.ts`: generic membership writes are IT/TENANT_ADMIN controlled. Do not relax this endpoint for Team Management. Manager reads already exist, but the new increment needs bounded, explicitly project-scoped selection and status metadata.
- `db/migrations/005_pre_phase3_schema_fixes.sql`: each Instrument Man has one Party Chief per project via `crew_rosters`. These rows are not named teams and cannot represent the requested example of one Superintendent, three Party Chiefs and six Instrument Men as a single team.
- `db/migrations/024_survey_staffing_links.sql`: one active explicit Superintendent link per Party Chief, tenant/project/Area foreign keys, and project-level staffing events. Area overlap is not proof of reporting ownership.
- `tenancy/application/save-survey-staffing.ts`: the existing narrow write path accepts compatible Requester/Viewer-to-Chief/IM changes only, with confirmation; it rejects another chief's Instrument Man and another existing chief Area. It does not yet provide named-team CRUD, Superintendent promotions, demotions/removals, or a UI.
- `src/components/ui/project-navigation.ts`: Manager currently sees Operations and All Requests, not Team Management.
- AOR and staffing records use deactivation/retirement; archived projects are immutable. Team deletion should preserve history using the same convention.

## Owner decisions — confirmed 2026-09-30

1. One active named team per person per project. This is a new named-team rule, not an inference from roster uniqueness.
2. Teams are organizational groups only. Area authorization and Superintendent → Party Chief → Instrument Man reporting links remain explicitly managed. Team membership does not establish or widen those relationships.
3. Removing a survey role leaves the existing project member as Requester. No project-membership or account deletion is implied.

These answers were supplied directly by the owner. Existing Survey Manager and unrelated elevated roles must not be mutable through this bounded feature. Role changes affecting a current team lead or active reporting/crew obligations must be blocked until those obligations are explicitly resolved; historical actions remain immutable.

## Implementation plan after the decision boundary

1. Record the owner's decisions and amend the narrow staffing spec, without relaxing general membership/invitation APIs.
2. Implement the smallest tenant/project-bound named-team model and append-only audit contract in one logical migration. Reuse user identities, AOR nodes, existing fixed role values and explicit reporting links. Add stale-write/version control for editable teams.
3. Implement Tenancy use cases and repositories, then thin Manager-only read/command API mappings. Validate complete proposed membership/lead/Area state before writes; commit changes and audit atomically. Bound lists and searches.
4. Extend only the approved fixed-role project staffing transitions, with confirmation and session invalidation. Protect lead/reporting references and archived projects; preserve historical ticket snapshots.
5. Add Team Management navigation and a compact Personnel/Teams/Create/Edit flow using the existing Axiom design system. Do not fetch the request dataset to render staffing.
6. Verify SQL, transaction rollback/concurrency, HTTP authorization/isolation, UI keyboard/mobile/states and existing tests. Checkpoint and report remaining broader-objective work separately.

## Explicitly out of scope

Scheduling, shifts, timekeeping, performance/productivity analytics, automated balancing, organization-wide HR, custom role definitions, cross-project personnel discovery, advanced historical staffing reports and a drag-and-drop organization chart. No invitation/account creation, ticket reassignment, historical data rewrite, or automatic analytics permission expansion is implied by team CRUD.

## Current verification and next point

At inspection: phase5 production checkpoint `f01040b`; clean worktree; TypeScript passes with write access for its incremental cache; all 317 tests pass; production build passes. These checks verify the existing checkpoint, not the unimplemented Team Management feature. The local preview still uses the earlier demo image and is not proof of current source behavior.

### Implemented server foundation — Batch 48

Migration 028 adds `survey_teams` and `survey_team_members`, tenant/project/Area/user/membership foreign keys, deferred lead-member integrity, active-name uniqueness, one-active-team-per-person uniqueness and versioned soft deactivation. It extends the existing project staffing event allowlist; no separate identity, role or authorization system is introduced.

Manager-only GET/POST/DELETE `/api/projects/[projectId]/survey/teams` provides bounded searchable team summaries, selected team details, and `mode=personnel` pages with current role and team assignment. POST creates or edits; edits require the displayed `expectedVersion`. DELETE requires `confirmDelete: true` and the current version. Mutations require `Idempotency-Key` and reuse the existing ledger. Authorization is checked before replay as well as before mutation. Archived projects reject writes.

All writes lock the project and current Manager project membership, verify that Manager's active session, validate the full proposed active survey-member/Area/lead population, then write membership/metadata and audit in one transaction. Subject account/membership rows are locked separately in stable user-ID order; a caller-account lock is deliberately avoided to prevent cross-project actor/subject deadlocks. Selected people cannot already belong to another active team; the lead must remain in the submitted membership list. Only compatible existing operational roles may join a team. Member removals and team deletion preserve historical rows; team CRUD never mutates Area assignments, crew rosters, reporting links, user sessions, tenant roles or ticket history. Role commands have a separate audited session-invalidating contract, described below.

Verification: fresh PostgreSQL migrations 001–028 pass; 35 actual PostgreSQL/route-handler scenarios pass, including concurrent stale edits, simultaneous exclusive membership, audit rollback, duplicate-name and foreign-person/Area rejection, cross-tenant/project/role/session checks, idempotency replay/mismatch and replay after lost Manager authority. Unit suite has 10 focused team tests and 327 total passing tests; final TypeScript and production build pass. These are in-process HTTP handler executions against a real database, not deployed-network or browser acceptance. The disposable test database was removed after testing; Sabine was untouched.

Reproducible database check: create an empty disposable PostgreSQL database named `swr_team_isolated` on loopback port 15489; set `DATABASE_URL`, `SWR_TEAM_POSTGRES=1` and a test-only `JWT_SECRET`; run `node --import tsx db/migrate.ts` then `node --import tsx tests/beta/survey-teams-postgres.ts`. The fixture refuses other addresses/names and nonempty tenant data. Never point it at Sabine.

Next logical point: fixed-role promotion/demotion/removal with reporting/lead-reference guards, then the Manager menu/page and explicit staffing controls; finish with real browser and deployed HTTP acceptance. The Team Management increment is not complete. Full KPI/performance acceptance and Superintendent personnel analytics remain separate unfinished requirements. The preview has not been rebuilt for this increment.

### Fixed-role commands — Batch 49

PATCH `/api/projects/[projectId]/survey/teams`, with `action: "set-role"`, now changes only an eligible existing project member's fixed operational role. Targets are Survey Superintendent, Party Chief, Instrument Man or Requester, subject to Full/Medium/Slim build compatibility. Current Manager, project-admin and unrelated elevated roles are protected. Source Viewer/Requester members can be promoted; removal keeps the account and project membership as Requester, never Viewer. No account invitation, tenant role or ticket-history mutation is performed.

The command requires an idempotency key, current `expectedRole`, displayed `expectedRoleVersion` and explicit confirmation. The version is the user's existing account/session version, so concurrent account changes or an intervening role change cannot silently accept a stale form. Successful changes invalidate that person's existing sessions and append `survey.role_changed` atomically. A no-op writes neither event nor session version. Current Manager authority is checked before idempotency replay.

Removing a survey role requires prior removal from a named team, including explicit replacement of its lead. Any active crew/reporting link or explicit Area/responsibility/acting grant blocks a role change until that obligation is separately resolved. Supported survey-role changes may retain organizational team membership, but never repurpose or infer operational grants. Historical ticket assignment snapshots remain untouched; active work may need separately authorized reassignment. Manager-facing obligation cleanup/reporting controls are still pending, so this API is not a complete end-to-end staffing workflow.

PostgreSQL concurrency testing exposed a genuine cross-project actor/subject deadlock when two Managers were eligible subjects in each other's project. The transaction now locks current Manager membership rather than the global caller account and locks subject accounts/memberships in stable order with `FOR NO KEY UPDATE`, compatible with the staffing audit's actor foreign-key locks. Manager session validity is checked at authorization; in-flight global account revocation is not serialized by a caller-account lock. Future requests must still pass active-session checks. The synchronized cross-project test returns two successful independent writes, while same-subject stale races permit only one successful change.

Verification: all 334 tests, TypeScript and production build pass; the focused team/role suite has 17 tests. Fresh isolated PostgreSQL migrations 001–028 and 56 database/route-handler scenarios pass, including audit-failure rollback of role and session version, protected and foreign/inactive subjects, role-change races, retained Requester membership, expired prior sessions and every obligation guard. These are real database/in-process handler checks, not deployed HTTP or browser acceptance. No new migration is needed beyond 028. Sabine's data and running preview remain unchanged.

Next logical point: Manager Team Management navigation/UI and explicit staffing/reporting controls, followed by browser/deployed acceptance and the remaining KPI/performance requirement audit.
