# Survey Reviewer Handover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let current project Survey Manager or central/project IT hand over one exact-Area Survey Reviewer obligation, reusing coverage or explicitly adding missing coverage to another current Superintendent while preserving their other Areas.

**Architecture:** Add narrow Tenancy read/command use cases and a PostgreSQL repository behind one injectable GET/POST handler. Reuse transactions, authentication and idempotency, add nullable retained audit evidence, and share inline controls between the existing Manager role editor and IT administration page.

**Tech Stack:** Existing TypeScript, Next.js15, React19, PostgreSQL15 acceptance runtime, pnpm, node:test/tsx and current external Playwright harness. No new dependencies/infrastructure.

**Spec:** [Approved design](../specs/2026-10-01-survey-reviewer-resolution-design.md) atb4548e50e902807283a895770a45f4c2410ae740, approved2026-10-01 (Decision27). Executors read the entire spec with this plan.

**Execution:** Decision28 records owner approval of this plan/native execution. Task1 API was pushed at42f84b5 (CODEX Batch72); Task2 shared controls were pushed at4cbf08e (Batch73). All task steps are complete. Final whole-range review and the verified parent-busy repair are recorded in Batch74; this is completion of the approved first slice, not Phase5 or Superintendent departure completion.

## Global Constraints

- Existing phase5 linked worktree; fetch/reassess before checkpoints. No reset/force push/merge/unrelated staging or dirty original D: checkout mutation.
- Current SURVEY_REVIEWER on one live top-level Area (depth0,parent null,not retired), active non-subcontractor subject. Manager subject population is VIEWER/REQUESTER/SURVEY_SUPERINTENDENT/PARTY_CHIEF/INSTRUMENT_MAN; only IT may investigate inactive/protected-role members.
- Replacement is a different active non-subcontractor current project SURVEY_SUPERINTENDENT. Both exact-Area review grant and individual assignment must exist at commit. No promotion, invitation, ancestor/combined/department/acting substitute, historical-row revival or arbitrary grant/Area editing.
- Mode reuse requires complete existing coverage; assignAdditional creates only missing rows, requires confirmAdditionalCoverage:true and explicit TEMPORARY/PERMANENT intent. Reuse rejects those fields. Temporary ends by confirmed manual handover, no expiry; other Areas and reused provenance remain intact.
- Current central IT, project IT, project Manager in that priority; lock/recheck real evidence. Leave assertAccessAdministrator/setup/navigation/role helpers and unrelated IT permissions unchanged.
- Private/no-store GET/POST; canonical UUIDs, strict input,10/25/50/100 pages, nonnegative safe offsets. One-statement rows/count/token; full relevant checksum independent of search/page, distinct from staffing. Never refresh token over stale displayed evidence.
- Current session/authority/editable project precede replay; historical replay does not impose fresh subject/replacement eligibility, resurrect or certify coverage. Stable key binds person/mode/intent/confirmation/token.
- Project FOR NO KEY UPDATE; shared sorted account/membership/company/witness locks, sorted grant locks; no exclusive global actor or ticket locking. Actual two-session evidence before concurrency claims. Unexpected failures use systematic-debugging; incompatible writer protocol stops work.
- Confirm next migration number before creating030. Nullable retained evidence only on existing RESPONSIBILITY_GRANTED/REVOKED actions, old rows unchanged. No secrets in audit; no update/delete audit API.
- Departing individual Area/reporting/crew/role/account/ticket state stays unchanged; separate role guard remains. Acting/FIELD_COORDINATOR/department/full Superintendent departure cleanup remain gated. No Sabine migration/cutover/data/attachments/backup mutation.
- Observed RED before new behavior, minimum implementation, focused GREEN/full required regressions; independently review and push each meaningful checkpoint.

## Review Focus

1. Lost Manager role plus independently retained IT authority permits the same actor's historical replay without changing audit history (Task1).
2. Adding only an assignment to an existing grant must not relabel old grant provenance or emit a fabricated grant event (Tasks1/2).
3. Permanent successor without coverage receives PERMANENT intent, preserving Jason's Area2 (Tasks1/2).
4. Late previous-person/page responses cannot attach stale evidence; cancel/reopen cannot clear a stale latch (Task2).
5. Central IT without project membership can use the section despite unrelated admin denials/missing navigation (Task2).

## File Map

Create in Task1:
- src/modules/tenancy/application/protected-obligations.types.ts (DTOs/typed evidence/port)
- src/modules/tenancy/application/read-protected-obligations.ts (authorized scoped reads)
- src/modules/tenancy/application/resolve-survey-reviewer.ts (transaction-owned policy/orchestration)
- src/modules/tenancy/infrastructure/protected-obligations.repository.ts (SQL/locks/conditional writes/audit)
- src/app/api/projects/[projectId]/survey/protected-obligations/handler.ts and route.ts (injectable transport/GET/POST exports)
- db/migrations/030_survey_reviewer_resolution_evidence.sql (reconfirm sequence)
- tests/tenancy/protected-obligations-read.test.ts, protected-obligations-command.test.ts, protected-obligations-route.test.ts
- tests/beta/protected-obligations-migration-postgres.ts (standalone before/after migration proof), protected-obligations-postgres.ts (read/command), protected-obligations-concurrency-postgres.ts, protected-obligations-session-postgres.ts and protected-obligations-http.mjs

Task2 creates src/components/ui/protected-survey-obligations.tsx, src/lib/protected-obligations-view.ts, tests/ui/protected-obligations-view.test.ts and tests/beta/protected-obligations-browser.mjs. Modify existing src/lib/apiClient.ts, src/components/ui/team-management.tsx (RoleEditor), src/app/(projects)/projects/[projectId]/(admin)/admin/page.tsx. Use existing Axiom primitives; targeted team-management.css only if necessary. Update CLAUDE access-audit guidance and authoritative implemented-status/CODEX docs at verified boundaries, no broad refactors.

## Shared Contract: Task1 Produces, Task2 Consumes

Use existing UUID/Page/AuthContext/DbClient/ProjectRole/ProjectStatus/CrewBuild. Export these exact types from protected-obligations.types.ts:

```ts
type CoverageIntent = 'TEMPORARY'|'PERMANENT';
type ResolveReviewerInput = {
 userId: UUID; grantId: UUID; replacementUserId: UUID;
 expectedSnapshot: string; confirmResolution: true;
} & ({coverageMode:'reuse'} | {
 coverageMode:'assignAdditional'; confirmAdditionalCoverage:true;
 coverageIntent:CoverageIntent;
});
interface ResolveReviewerResult {
 resolved:true; grantId:UUID; resolutionEventId:UUID; resolvedAt:string;
 replacementUserId:UUID; replacementGrantId:UUID; replacementAssignmentId:UUID;
 createdReviewGrant:boolean; createdIndividualAssignment:boolean;
}
interface ProtectedPageQuery {search:string; limit:10|25|50|100; offset:number}
type ProtectedReadQuery =
 | {mode:'personnel'; query:ProtectedPageQuery}
 | {mode:'obligations'; userId:UUID; query:ProtectedPageQuery}
 | {mode:'candidates'; userId:UUID; grantId:UUID; query:ProtectedPageQuery};
interface ProtectedPerson {userId:UUID; name:string; email:string; role:ProjectRole; active:boolean; responsibilityCount:number; actingCount:number}
interface ReviewerObligation {grantId:UUID; responsibility:'SURVEY_REVIEWER'|'FIELD_COORDINATOR'; areaId:UUID|null; areaName:string|null; canResolve:boolean; unsupportedReason:string|null; addedCoverageIntent:CoverageIntent|null;addedIndividualAssignment:{id:UUID;coverageIntent:CoverageIntent}|null}
interface ReviewerCandidate {userId:UUID; name:string; email:string; replacementGrantId:UUID|null; replacementAssignmentId:UUID|null; canReuse:boolean; missingReviewGrant:boolean; missingIndividualAssignment:boolean}
type ProtectedReadResult =
 | {mode:'personnel'; project:{status:ProjectStatus;crewBuild:CrewBuild}; personnel:Page<ProtectedPerson>}
 | {mode:'obligations'; project:{status:ProjectStatus;crewBuild:CrewBuild}; person:ProtectedPerson; obligations:Page<ReviewerObligation>; actingCount:number; departmentMembershipCount:number; snapshotToken:string}
 | {mode:'candidates'; candidates:Page<ReviewerCandidate>; snapshotToken:string};
```

Reads/POST return these objects directly, errors use incumbent errorResponse shape/status. addedCoverageIntent describes actually added coverage, not relabeling reused grants. Candidate IDs are read evidence, never client-selected creation IDs. POST selects replacementUserId; Area/coverage IDs/prior state/authority are server-owned.

### Repository and application interfaces

ProtectedScope is {tenantId:UUID;projectId:UUID}. ResolutionAuthority records branch TENANT_ADMIN|PROJECT_ADMIN|PROJECT_SURVEY_MANAGER and the checked actor account/session/company and authorizing membership snapshots. Define typed PersonEvidence, AreaEvidence, ResponsibilityGrantEvidence and IndividualAssignmentEvidence from the spec audit fields, including original provenance and nullable revocation/deactivation. ResolutionContext contains scope/project/current authority, historical departing grant, replacement identity/current membership, Area/level, exact replacement grant or null and all current individual witnesses. Historical loads tolerate inactive/revoked/missing live eligibility; ownership/missing identities are404. Fresh eligibility belongs in the use case.

Port ProtectedObligationsRepository, implemented by ProtectedObligationsPgRepository:
- readAuthority(db:DbClient, auth:AuthContext, projectId:UUID):Promise<ResolutionAuthority> - initial current authority before guessed resource lookup.
- readPage(db:DbClient, scope:ProtectedScope, authority:ResolutionAuthority, query:ProtectedReadQuery):Promise<ProtectedReadResult> - SQL population fences, single-statement matching counts/token.
- lockResolutionContext(db:DbClient, auth:AuthContext, projectId:UUID, input:ResolveReviewerInput):Promise<ResolutionContext> - project/sorted historical identity/member/company/Area/grant/witness locks; current authority/historical ownership before replay.
- snapshot(db:DbClient, scope:ProtectedScope, userId:UUID):Promise<string> - same checksum as readPage, includes eligible candidates without coverage and retained historical state.
- createIndividualCoverage(db:DbClient, scope:ProtectedScope, userId:UUID, areaId:UUID, id:UUID, at:Date):Promise<IndividualAssignmentEvidence>.
- createReviewCoverage(db:DbClient, scope:ProtectedScope, userId:UUID, areaId:UUID, actorId:UUID, id:UUID, at:Date):Promise<ResponsibilityGrantEvidence>.
- revokeSelectedGrant(db:DbClient, scope:ProtectedScope, input:ResolveReviewerInput, actorId:UUID, at:Date):Promise<boolean> - exact current tenant/project/subject/id conditional write.
- recordResolution(db:DbClient, context:ResolutionContext, input:ResolveReviewerInput, result:ResolveReviewerResult, coverage:{grant:ResponsibilityGrantEvidence;assignment:IndividualAssignmentEvidence}, at:Date):Promise<void> - revoked event plus created-grant event iff createdReviewGrant, correlated with resolution ID, complete server-derived snapshots.

Application exports readProtectedObligations(repo,db,auth,projectId,query):Promise<ProtectedReadResult>, authorizeReviewerResolution(repo,db,auth,projectId,input):Promise<ResolutionContext>, resolveSurveyReviewer(repo,db,context,input):Promise<ResolveReviewerResult>; parameter types are the port/DbClient/AuthContext/UUID/query/context/input above. Caller owns transaction/ledger. Use cases own policy, repository owns SQL.

Handler exports handleGetProtectedObligations(req:NextRequest,ctx:{params:Promise<{projectId:string}>},deps?:ProtectedObligationsDeps):Promise<Response> and matching handlePostProtectedObligations. Deps inject repo, requireAuth:typeof requireActiveAuth (call with transaction db again), generic withTransaction and typeof executeIdempotentHttpMutation. Initial auth/parsing then transaction; authorizeReviewerResolution holds checked evidence before ledger. After waiting for those locks and immediately before ledger entry, call requireActiveAuth(req,db) again and compare expiresAt/current locked account version; cached initial authentication is insufficient. Callback resolveSurveyReviewer. Endpoint key POST:/api/projects/${projectId}/survey/protected-obligations. Current expiration/token/account/session rechecked as specified; no global logout redesign.

## Task 1: scoped API and atomic coverage/audit handover

**Files:** Task1 files above, CLAUDE access-audit guidance and checkpoint status docs. No UI wiring.
**Consumes:** approved spec and existing auth/transaction/idempotency/schema. **Produces:** shared contract above, operational GET/POST and disposable migration/race/HTTP evidence.

- [x] **Step 1: write failing scoped-read/schema tests.** Named cases: manager_reads_only_editable_project_people; candidate_without_area_is_selectable; rows_counts_token_share_state; token_independent_of_page_search; it_inactive_investigation_only; archived_reads_disable_actions; malformed_unknown_duplicate_filters_refused. Unit fixture helper owns concrete synthetic UUID state and injected fake repo/deps with read(actor,query)/command(actor,input,key) returning parsed responses and persisted() snapshots; no global auth bypass. Add the standalone gated migration harness and read phase in the scoped PostgreSQL harness: legacy events captured before030, object accepted only on two responsibility actions, scalars/arrays/company evidence refused, old event content unchanged (exclude the new null column).

```ts
assert.equal(candidateWithoutArea.replacementGrantId,null);
assert.equal(candidateWithoutArea.replacementAssignmentId,null);
assert.equal(candidateWithoutArea.canReuse,false);
assert.equal(candidateWithoutArea.missingReviewGrant,true);
assert.equal(candidateWithoutArea.missingIndividualAssignment,true);
assert.match(page1.snapshotToken,/^[a-f0-9]{32}$/);
assert.equal(page2.snapshotToken,page1.snapshotToken);
assert.equal(searchPage.snapshotToken,page1.snapshotToken);
assert.deepEqual(oldEventsAfter,oldEventsBefore);
```

- [x] **Step 2: observe read/schema RED.** Run node --import tsx --test tests/tenancy/protected-obligations-read.test.ts tests/tenancy/protected-obligations-route.test.ts. Record expected missing export/behavior, not unrelated import/config failure. Disposable schema/read phase must fail expected missing evidence/read behavior before implementation.

- [x] **Step 3: implement minimum schema/authorized read contract.** Create030 after numbering check; DTOs, purpose-specific current-authority reader, bounded query/count/checksum per mode, application read and GET route. Include candidates lacking coverage and historical token state. Manager fence enforced in SQL/use case; annotations derive only from retained actually-added coverage evidence. Do not change shared admin/setup/navigation helpers.

- [x] **Step 4: verify focused read/schema GREEN.** Repeat Step2 and disposable schema/read phase; legacy rows remain null, incumbent company inserts work, migration runner skips applied030. Never a production/Sabine database.

- [x] **Step 5: write failing command/route/audit tests.** Named cases: reuse_never_creates; additional_both_missing_preserves_other_areas; grant_only_adds_assignment_without_grant_event; assignment_only_adds_grant; permanent_successor_not_temporary; replay_after_coverage_loss_never_recreates; current_authority_before_replay; lost_manager_current_it_replays; stale_writes_nothing; creation_audit_ledger_failure_rolls_back; manager_general_it_denied. Strict mode/intent/confirmation parsing and negative self/foreign/inactive/subcontractor/wrong-role replacement, protected Manager subject, unsupported/null/non-Area/retired/FIELD_COORDINATOR/acting/department targets. Exact audit assertions cover actor company/account/membership, reused/new provenance and correlation.

```ts
assert.equal(additional.body.createdReviewGrant,true);
assert.equal(additional.body.createdIndividualAssignment,true);
assert.deepEqual(after.jasonArea2,before.jasonArea2);
assert.deepEqual(after.departingAssignmentsRolesReportingTickets,before.departingAssignmentsRolesReportingTickets);
assert.equal(revocationEvidence.coverageIntent,'TEMPORARY');
assert.equal(grantOnly.events.filter(e=>e.action==='RESPONSIBILITY_GRANTED').length,0);
assert.equal(permanentEvidence.temporaryCoverage,false);
assert.deepEqual(replayed.body,first.body);
assert.deepEqual(afterReplay,beforeReplay);
assert.equal(stale.status,409);
assert.equal(stale.body.error.code,'STALE_PROTECTED_OBLIGATIONS');
```

- [x] **Step 6: observe command RED.** Run node --import tsx --test tests/tenancy/protected-obligations-command.test.ts tests/tenancy/protected-obligations-route.test.ts; gated command phase fails missing POST/creation/audit behavior. Record before mutation implementation.

- [x] **Step 7: implement minimum command.** Lock/recheck actual authority/historical ownership before ledger, fresh eligibility/checksum inside callback. Create only confirmed missing exact-Area rows, verify actual complete postcondition then conditional departing revoke. Generate server IDs/time per fresh operation. Existing active-grant unique index handles competing grant insert: unexpected conflict409/full rollback, no silent adoption/retry. No absence row-lock/global uniqueness claims for generic assignment inserts. Atomic retained revoked/granted-if-created events and ledger. Private/no-store success/errors. Fault injection only in harness dependencies, no production switches.

- [x] **Step 8: focused GREEN and actual SQL security/concurrency.** Repeat focused tests and gated real-handler/repository harness. Two sessions, both winner orders: witness/grant revocation, replacement role/company/session change, actor membership/company change, Area retirement/level change, concurrent role removal. Same/different keys, same replacement/Area from two departing obligations, uniqueness rollback, generic individual insert, SETUP grant-replacement FK contention, shared ticket review locks, two-project sorted subjects. Test lock/statement timeouts must be bounded and40P01/timeouts fail; no hiding with retries. Fault each insert/revoke/audit/ledger and assert full state/history rollback/no retry row. Historical replay after later Area/assignment/grant/subject-membership/replacement-account changes returns prior result without writes; lost current actor/archived/expired/logged-out session denies. Independent retained IT authority may permit same-actor replay. Real synthetic ticket visibility/review proves new and reused coverage; other Areas/roles/individual departed assignments/reporting/tickets unchanged. Do not claim global in-flight logout serialization.

- [x] **Step 9: actual HTTP and broader verification.** Current production runtime3107 against only gated fixture; new HTTP script covers real cookies, negative status/no-store, strict input and synthetic review visibility. Run full required commands/regressions below; actual exit0 and checked counts, not historical baselines.

- [x] **Step 10: independent review and durable API checkpoint.** Read-only authorization/persistence/concurrency review, reconcile/fix approved contract violations and repeat relevant/full checks. Update CLAUDE existing responsibility-event evidence (no ticket event), API implemented status/UI pending and CODEX actual RED/GREEN/runtime/counts/limits. Diff/staged review, explicit paths, commit feat: add protected survey reviewer coverage handover; ordinary git push origin phase5:phase5; verify remote SHA/0:0/clean before Task2.

## Task 2: shared Manager/IT controls and production browser acceptance

**Files:** new component/view helper/view tests/browser script; actual API client, Manager RoleEditor/admin page paths above; targeted existing CSS/status docs/CODEX.
**Consumes:** Task1 DTOs/GET/POST/no-store/error/checksum/ledger. **Produces:** ProtectedSurveyObligations({projectId:string,userId?:UUID,onResolved?:(result:ResolveReviewerResult)=>void}); omitted userId means IT discovery, supplied userId means selected Manager person. Mount outside RoleEditor's existing role-change form: no nested forms. Add apiClient.readProtectedObligations(projectId:string,query:ProtectedReadQuery):Promise<ProtectedReadResult> and apiClient.resolveSurveyReviewer(projectId:string,input:ResolveReviewerInput,idempotencyKey:string):Promise<ResolveReviewerResult>.

Pure view exports: initialProtectedEditor():ProtectedEditorState; reduceProtectedEditor(state:ProtectedEditorState,event:ProtectedEditorEvent):ProtectedEditorState; canConfirmProtectedResolution(state:ProtectedEditorState):boolean. State owns current person/grant/candidate, original obligation/candidate tokens, mode/intent, confirmations, pending/uncertain payload/key, request generation and latched stale conflict. Typed events cover current-generation loading/response, selection/mode/intent/confirmation, begin/uncertain/failure/success/stale/cancel/deliberate reload. Limit this to the new flow; no generalized mutation framework.

- [x] **Step 1: write failing state/browser expectations.** Names: candidate_token_mismatch_blocks; cancel_reopen_keeps_stale; late_previous_person_response_ignored; uncertain_retry_freezes_person_mode_intent_key; additional_requires_explicit_confirmation_intent; grant_only_preview_truthful. Concrete Task1 DTO fixtures and reducer transitions assert:

```ts
assert.equal(canConfirmProtectedResolution(mismatchedTokens),false);
assert.equal(cancelledStale.stale,true);
assert.deepEqual(latePreviousResponse,currentPersonState);
assert.deepEqual(uncertainRetry.attempt,firstAttempt.attempt);
assert.equal(canConfirmProtectedResolution(noAdditionalConfirmation),false);
assert.equal(canConfirmProtectedResolution(noAdditionalIntent),false);
```

New production browser script expects Manager to select Jason without Area1 coverage, preview missing rows/Area2 retention/manual handover, confirm and succeed with no automatic demotion; IT same controls. Central IT without membership operates despite unrelated configuration errors. Assert empty/loading/error/unsupported, pending/uncertain/cancel/late-response/actual stale behavior, keyboard/focus, permanent successor labels. Missing controls are expected before wiring.

- [x] **Step 2: observe UI RED.** Run node --import tsx --test tests/ui/protected-obligations-view.test.ts; new production browser script against Task1 runtime/gated fixture fails missing handover controls. No source permissions or mocked mutation are changed to induce success.

- [x] **Step 3: implement minimum shared controls.** Add API methods and reducer/component; independently rendered admin Card and selected Manager integration. Apply Impeccable at this actual UI boundary, retain existing Axiom geometry/labels/primitives. Bounded on-demand search/page, eligible people lacking this Area, explicit reused/new rows, other Areas retained, temporary/permanent intent/confirmations and remaining blockers. Store original displayed token; candidate mismatch disables confirmation until deliberate reload. Ignore outdated request generation. Freeze uncertain payload/key/selections, prevent duplicate submit; cancel/reopen never clears stale latch. Success announces one handover, refreshes blockers, restores heading/trigger focus and separately confirms role change. Archived evidence remains readable, no mutation controls. No new assets/fonts/modal/nav/general admin surfaces.

- [x] **Step 4: focused GREEN and real browser acceptance.** Repeat unit test; production desktop1440/mobile390 plus keyboard focus/no overflow/page errors. Manager/project IT/central IT no membership, denied other-project/former/subcontractor Manager and field direct calls. Reuse/missing-one/missing-both, existing-row provenance, explicit confirmations/intent, permanent successor and unchanged Jason Area2; residual departing role blockers/unchanged role. Search/paging retained selection, late responses, double-submit/uncertain unchanged-key retry, actual stale409/no write/audit, cancellation latch, deliberate reload. Label synthetic lost-response/network injection; mutations/auth/SQL are real disposable runtime. Inspect ignored captures with view_image when used, no captures/secrets in commit.

- [x] **Step 5: required regressions and independent review.** Fresh required unit/TypeScript/Windows/Linux builds, Task1 schema/SQL/race/HTTP and existing staffing/workforce/review/browser regressions. Recreate only owned disposable fixtures if preconditions need freshness. Independent read-only consequential review; reconcile findings, fix approved violations and rerun relevant/full verification after changes.

- [x] **Step 6: document/push UI checkpoint.** Mark narrow UI handover implemented, preserve complete Superintendent cleanup/other contract gates, append CODEX actual runtime/checks/limits. Review diff/staged explicit paths, commit feat: expose manager and IT survey reviewer handovers; push origin phase5:phase5; verify remote SHA/0:0/clean. No Sabine deployment. Reassess authoritative queue; complete Superintendent departure cleanup needs its own contract.

## Disposable Verification Procedure

Use fresh owned PostgreSQL15 at127.0.0.1:15489/swr_team_isolated with SWR_TEAM_POSTGRES=1 and test-only JWT_SECRET. Validate URL/owned label/fresh empty tenant population before migrations; do not load retained .env or reset/reseed an existing dataset. Credentials/runtime files remain ignored local state. New protected fixture owns disjoint synthetic project/user IDs/name sentinel and refuses conflicting state or unexpected tenant population; runs after fresh survey-teams fixture. Preserve Sabine3106/15488, attachments/volumes/backups/ownership. Stop/recreate only identity-verified disposable resources when repeat prerequisites need freshness; Windows background helpers use hidden windows.

Migration proof uses a separate fresh disposable run before the regression database: protected-obligations-migration-postgres.ts checks exact URL/owned synthetic state, requires empty tenant population, applies001-029 in order while recording _migrations, creates only its own synthetic identity/project/legacy access events, captures them, applies030 and records its filename in that transaction. Assert old-row content unchanged/new evidence null, old-format inserts work, evidence constraints work; node --import tsx db/migrate.ts then proves runner skip. After this run retire only that identity-verified disposable container/database; provision a new fresh regression database at the same gated URL. Do not mix its synthetic tenants with the survey-teams fresh fixture.

For the new regression database, migrate all files with node --import tsx db/migrate.ts and explicit gated process environment, avoiding pnpm db:migrate's .env load. New protected harness runs read then mutations after the existing team fixture, uses disjoint synthetic cases for destructive membership/history scenarios, and leaves a verified synthetic login project for HTTP/browser. Never silently reseed conflicting data.

Task1 standalone migration run commands (with its fresh gated environment), then re-provision the separate regression fixture as above:

```powershell
node --import tsx tests/beta/protected-obligations-migration-postgres.ts
node --import tsx db/migrate.ts
```

At both checkpoints verify each command exit0 and inspect results:

```powershell
pnpm tsc --noEmit --incremental false
pnpm test
pnpm build
docker build --target runtime -t swrtracker-phase5-reviewer-verified .
```

Fresh disposable regression fixture family, following current Batch67 preconditions (read each script before execution):

```powershell
node --import tsx tests/beta/survey-teams-postgres.ts
node --import tsx tests/beta/superintendent-kpi-postgres.ts
node --import tsx tests/beta/survey-staffing-safety-postgres.ts
node --import tsx tests/beta/survey-staffing-unlink-postgres.ts
node --import tsx tests/beta/team-workforce-postgres.ts
node --import tsx tests/beta/workforce-repair-postgres.ts
node --import tsx tests/beta/protected-obligations-postgres.ts
```

Start the current built native or Docker production runtime on127.0.0.1:3107 against that same gated environment; record which runtime, never call a native server a production image. Run safety HTTP before other staffing mutation harnesses. Task1 requires new real HTTP/visibility checks and current relevant read/review regressions whose fixtures are valid:

```powershell
node tests/beta/survey-staffing-safety-http.mjs
node tests/beta/protected-obligations-http.mjs
node tests/beta/superintendent-kpi-http.mjs
node tests/beta/survey-staffing-http.mjs
```

Task2 additionally sets SWR_PLAYWRIGHT_MODULE to the existing external module; SWR_QA_CAPTURE=0 unless ignored captures needed. Run:

```powershell
node tests/beta/protected-obligations-browser.mjs
node tests/beta/team-workforce-browser.mjs
node tests/beta/workforce-repair-browser.mjs
node tests/beta/survey-staffing-unlink-browser.mjs
node tests/beta/survey-staffing-browser.mjs
```

Preconditions, not this list order alone, determine fixture freshness. The legacy mocked survey-teams-browser.mjs may be run as UI regression, but is not live authorization evidence. Unit mocks do not establish SQL locking; builds do not establish DB behavior; browser evidence does not certify load/physical-device/assistive-technology/hosted readiness. Record actual counts/limitations rather than historical targets.

## Self-Review and Execution Handoff

Spec mapping: authority/scope/read/token to Task1 read/route tests; additive evidence/creation/reuse/temporary/permanent to Task1 schema/command; replay/locks/faults to actual two-session acceptance; Manager/IT entry/focus/stale/uncertain to Task2. All five Review Focus conditions have owning tests. Shared DTO/signature names consistent; no placeholders or unowned plan dependencies; plan specifies decisions/assertions/interfaces, not product implementation bodies.

Recommend Native single implementer for tightly coupled transaction/repository/shared editor, with independent read-only reviews at both pushed boundaries under the user's policy. Sequential subagent-driven task/reviewer execution is available, with no parallel shared-state implementation. Decision28 records the subsequent owner plan/native-execution approval. Inline fixtures replace the unnecessary shared helper; separate bounded concurrency/session harnesses own those acceptance cases. Existing staffing-read HTTP needs its separate fresh two-tenant/no-roster prerequisite fixture; do not weaken that guard.
