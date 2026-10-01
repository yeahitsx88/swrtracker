# Superintendent Individual Area Unlink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the current project Survey Manager explicitly remove one eligible Superintendent individual Area assignment after current replacement coverage and deliberate reporting resolution.

**Architecture:** Add focused Tenancy read/command/SQL units behind the existing staffing resource, preserving incumbent Chief handlers and checksum. Reuse the current staffing audit and idempotency transaction; extend the Manager RoleEditor with a separately coordinated Area-obligations section. Two sequential native checkpoints: API/persistence acceptance, then Manager UI acceptance.

**Tech Stack:** Existing Next.js15, React19, TypeScript5, PostgreSQL15, pg, node:test/tsx, pnpm and external Playwright harness. No dependency, migration or infrastructure additions.

**Spec:** [Approved written specification](../specs/2026-10-01-superintendent-area-unlink-design.md), approved by the owner's "Approved" after f9560f5607f9b58345cb8ef5689446c4727fa18a; Decision30 records this stage approval. Implementation-plan review remains pending. Preserve the owner's Native execution preference.

## Global Constraints

- "actual current project SURVEY_MANAGER membership, active account/session and non-subcontractor company"; IT-only is excluded, actual Manager plus IT qualifies.
- "Fresh targets are active non-subcontractor current project SURVEY_SUPERINTENDENT members in a FULL build." SETUP/ACTIVE may mutate; ARCHIVED is read-only.
- "Select one active aor_assignments UUID"; individual department_id null, live top-level Area depth0/parent null/not retired. No bulk unlink, promotion, account change or reporting move.
- "BOTH an active exact-Area SURVEY_REVIEWER responsibility grant and an active exact-Area individual assignment"; distinct eligible replacement, explicitly selected exact witness IDs, reuse only.
- "no active departing responsibility grant may remain in this Area subtree or with null/project-wide scope"; any active acting grant blocks. Reporting absence includes inactive/wrong-role Chiefs and retired descendant nodes.
- "page sizes10/25/50/100, nonnegative safe-integer offset"; search up to200 characters, canonical UUIDs, checksum32 lowercase hex, strict fields, private/no-store responses.
- "Search, mode, selected link and page changes do not alter the underlying state token." One subject checksum across all its assignment Areas; do not change incumbent snapshotCte/Chief tokens.
- "Current actor/session/Manager authority/project gates still apply." After waits, current authentication precedes ledger; exact historical replay has no fresh subject/replacement/coverage checks or writes.
- "project FOR NO KEY UPDATE first"; stable scoped identity/evidence locks, actual authorizing membership held. Incompatible existing writer protocol stops execution for contract reassessment.
- "event_type survey.staffing_saved" with versioned action unlink-superintendent-area, one transaction with conditional exact deactivation and successful ledger result. No new enum/migration or ticket/access event.
- "Exact unchanged uncertain retry stays available." Three-way role/handover/cleanup controls and submit guards; stale latches survive cancel, late responses ignored.
- Preserve retained Sabine database/attachments/backups/containers. No expiry, retention cleanup, invented personnel, generalized permissions, account lifecycle, other protected resolution or deployment.

## Review Focus

1. Selecting a different assignment/page/search must retain the same canonical subject token, and a mismatch must never rebase a pending confirmation (Task1 read tests; Task2 reducer/browser tests).
2. An inactive or wrong-role Chief linked to a retired descendant still blocks cleanup and appears as a specific existing-tool/lifecycle obligation (Task1 dependency tests; Task2 guidance tests).
3. A legacy assignment with no handover event can be unlinked; duplicate/overlapping individual rows remain visible and department records confer no invented Superintendent authority (Task1 preservation tests; Task2 duplicate preview).
4. Historical replay after replacement role/coverage loss returns the original result without recreation, while current Manager/session loss still denies it (Task1 real transactions/session tests).
5. Direct requestSubmit and duplicate submits during any adjacent pending/uncertain command must send no overlapping command; unchanged uncertain retry must remain usable (Task2 browser tests).

---

## File Map

Task1 creates:
- `src/modules/tenancy/application/superintendent-area.types.ts`: DTOs, evidence and repository port.
- `src/modules/tenancy/application/read-superintendent-areas.ts`: scoped read validation/orchestration.
- `src/modules/tenancy/application/unlink-superintendent-area.ts`: historical authorization and fresh cleanup policy.
- `src/modules/tenancy/infrastructure/superintendent-areas.repository.ts`: canonical single-statement reads, held locks, conditional deactivation and audit.
- `src/app/api/projects/[projectId]/survey/staffing/superintendent-area-handler.ts`: injectable new GET/PATCH transport.
- `src/app/api/projects/[projectId]/survey/staffing/dispatch.ts`: transport-only routing to new versus incumbent handlers.
- `tests/tenancy/superintendent-area-read.test.ts`, `superintendent-area-command.test.ts`, `superintendent-area-route.test.ts`: unit/route contracts.
- `tests/beta/superintendent-area-postgres.ts`, `superintendent-area-concurrency-postgres.ts`, `superintendent-area-session-postgres.ts`, `superintendent-area-http.mjs`: actual disposable persistence/writer/session/HTTP acceptance.

Task1 modifies existing staffing `route.ts` GET/PATCH delegation only; POST and `handler.ts`/StaffingDeps remain compatible. Update `docs/CLAUDE.md` audit guidance at implementation, checkpoint status in PRODUCT/Team Management/contract and completion audits, append CODEX. No migration or global auth/role helper change.

Task2 creates `src/lib/superintendent-area-view.ts`, `src/components/ui/superintendent-area-obligations.tsx`, `tests/ui/superintendent-area-view.test.ts`, `tests/beta/superintendent-area-browser.mjs`. Modify `src/lib/apiClient.ts`, `src/components/ui/team-management.tsx` RoleEditor and `src/components/ui/protected-survey-obligations.tsx` optional invalidation coordination. Existing Axiom controls/team-management.css suffice; no IT admin cleanup wiring. Update actual implemented-status/CODEX evidence only at verified boundaries.

## Shared Contract: Task1 Produces, Task2 Consumes

Use existing UUID, Page, DbClient, AuthContext, ProjectStatus, CrewBuild and ProjectRole. Export these exact DTOs from superintendent-area.types.ts:

```ts
type SuperintendentAreaPageQuery={search:string;limit:10|25|50|100;offset:number};
type SuperintendentAreaReadQuery=
 |{mode:'superintendent-areas';superintendentId:UUID;query:SuperintendentAreaPageQuery}
 |{mode:'superintendent-area-replacements'|'superintendent-area-reporting';superintendentId:UUID;linkId:UUID;query:SuperintendentAreaPageQuery};
type SuperintendentAreaAssignment={assignmentId:UUID;areaId:UUID;areaName:string;createdAt:string;retired:boolean;depth:number;parentId:UUID|null;duplicateIndividualCount:number;overlappingIndividualCount:number;responsibilityCount:number;actingCount:number;reportingCount:number;canUnlink:boolean;refusalReason:string|null};
type SuperintendentAreaReplacement={userId:UUID;name:string;email:string;replacementGrantId:UUID;replacementAssignmentId:UUID};
type SuperintendentAreaReporting={linkId:UUID;partyChiefId:UUID;name:string;email:string;role:ProjectRole|null;active:boolean;areaId:UUID;areaName:string;retired:boolean;canUseStaffing:boolean;refusalReason:string|null};
type SuperintendentAreaReadResult={project:{status:ProjectStatus;crewBuild:CrewBuild};person:{userId:UUID;name:string;email:string;role:ProjectRole|null;active:boolean};snapshotToken:string}&(
 |{mode:'superintendent-areas';assignments:Page<SuperintendentAreaAssignment>;departmentMembershipCount:number;sharedDepartmentAssignmentCount:number}
 |{mode:'superintendent-area-replacements';replacements:Page<SuperintendentAreaReplacement>}
 |{mode:'superintendent-area-reporting';reporting:Page<SuperintendentAreaReporting>});
type UnlinkSuperintendentAreaInput={action:'unlink-superintendent-area';superintendentId:UUID;linkId:UUID;replacementUserId:UUID;replacementGrantId:UUID;replacementAssignmentId:UUID;expectedSnapshot:string;confirmUnlink:true};
type UnlinkSuperintendentAreaResult={changed:true;assignmentId:UUID;unlinkedAt:string;unlinkEventId:UUID;replacementUserId:UUID;replacementGrantId:UUID;replacementAssignmentId:UUID};
```

Return DTOs directly, incumbent errorResponse shape/status. No client Area/actor/role field. Payload version1 pins correlationId=result.unlinkEventId, confirmedAt=result.unlinkedAt, previousAssignment=context.assignment, subject=context.subject, replacement={identity,grant,assignment,provenance:"reused"}, area/subtreeIds, verifiedAbsence={reportingCount:0,responsibilityCount:0,actingCount:0}, expectedSnapshot/confirmUnlink, authority=context.authority plus heldMembershipIds, and preservation of role/account/request/other-Area records. Identity/grant/assignment fields come from the held context, never client assertions. Replacement witnesses are deterministic by UUID ordering; each eligible person appears once, chosen witnesses bind the command. Counts are scoped current diagnostic evidence, never implicit authorization.

### Application, repository and transport interfaces

In superintendent-area.types.ts define AreaUnlinkScope={tenantId:UUID;projectId:UUID}; AreaUnlinkAuthority extends that scope with actorId, actorMembershipId, actorCompanyId (UUID), actorCompanyType:string, actorSessionVersion:number, project:{status:ProjectStatus;crewBuild:CrewBuild}, expiresAt?:Date. Actual membership role is SURVEY_MANAGER, never an IT-priority label.

Reuse the existing typed ResolutionPerson, IndividualAssignmentEvidence, ResponsibilityGrantEvidence and ResolutionArea from protected-obligations.types.ts, without changing them. Define AreaUnlinkContext={authority:AreaUnlinkAuthority;subject:ResolutionPerson;replacement:ResolutionPerson;assignment:IndividualAssignmentEvidence;area:ResolutionArea;replacementGrant:ResponsibilityGrantEvidence|null;replacementAssignment:IndividualAssignmentEvidence|null;subtreeIds:UUID[];reportingLinkIds:UUID[];responsibilityGrantIds:UUID[];actingGrantIds:UUID[];heldMembershipIds:UUID[]}. Scope/ownership is server checked, arrays represent current held dependency evidence, sorted deterministically. Null/missing current replacement coverage is tolerated before historical replay; fresh success requires the exact supplied witnesses.

Port SuperintendentAreaRepository, implemented by SuperintendentAreasPgRepository:
- readPage(db:DbClient,auth:AuthContext,projectId:UUID,input:SuperintendentAreaReadQuery):Promise<SuperintendentAreaReadResult>: actual current Manager authorization, scoped rows/count/token in one statement, including correct errors when the page is empty.
- lockUnlinkContext(db:DbClient,auth:AuthContext,projectId:UUID,input:UnlinkSuperintendentAreaInput):Promise<AreaUnlinkContext>: project-first sorted held evidence; current Manager/editable FULL project and retained selected assignment ownership checked before ledger. Do not impose fresh subject/replacement/Area activity here.
- snapshot(db:DbClient,scope:AreaUnlinkScope,superintendentId:UUID):Promise<string>: exactly the read checksum, composes exported snapshotCte plus ordered scoped names/membership IDs, protected/acting/provenance/audit evidence and all subject-Area eligible replacement populations.
- deactivateAssignment(db:DbClient,scope:AreaUnlinkScope,input:UnlinkSuperintendentAreaInput,at:string):Promise<boolean>: exact tenant/project/subject/id individual active row conditional update, true only for one returned row.
- recordUnlink(db:DbClient,context:AreaUnlinkContext,input:UnlinkSuperintendentAreaInput,result:UnlinkSuperintendentAreaResult):Promise<void>: one version1 survey.staffing_saved payload action unlink-superintendent-area, complete approved retained evidence and reused provenance, event ID/time from result.

Application exports readSuperintendentAreas(repo,db,auth,projectId,input):Promise<SuperintendentAreaReadResult>, authorizeSuperintendentAreaUnlink(repo,db,auth,projectId,input):Promise<AreaUnlinkContext>, unlinkSuperintendentArea(repo,db,context,input):Promise<UnlinkSuperintendentAreaResult>; parameter types are the port and types above. The caller owns transaction/ledger; use cases own policy and repository owns SQL.

New handler exports handleGetSuperintendentAreas(req:NextRequest,ctx:{params:Promise<{projectId:string}>},deps?:SuperintendentAreaDeps):Promise<Response> and handlePatchSuperintendentArea with the same signature. SuperintendentAreaDeps injects repo:SuperintendentAreaRepository, requireAuth:typeof requireActiveAuth, typeof withTransaction and typeof executeIdempotentHttpMutation. Authenticate/strictly parse, authorize/lock in transaction, call requireAuth(req,db) again after waits and validate expiry/locked actor session version before ledger. Endpoint namespace: PATCH:/api/projects/${projectId}/survey/staffing:unlink-superintendent-area. Callback runs fresh unlink; historical replay bypasses it.

Transport dispatcher exports dispatchGetSurveyStaffing and dispatchPatchSurveyStaffing with the same request/context signature and optional SurveyStaffingDispatchDeps. That deps object owns four injected handler functions: getChief=handleGetSurveyStaffing, patchChief=handlePatchSurveyStaffing, getAreas=handleGetSuperintendentAreas, patchArea=handlePatchSuperintendentArea; each accepts request/context and returns Promise<Response>. GET dispatches only the three exact new modes; PATCH inspects req.clone().json() for the exact action, preserving the original stream. Malformed JSON delegates incumbent validation, not an alternative authorization path; unexpected clone/read failures propagate. Add private,no-store at the GET/PATCH route transport boundary for all outcomes (cache metadata only); preserve incumbent response bodies/status/authentication and POST. Test unknown/duplicate modes, malformed JSON, old GET/PATCH and independent same textual keys across namespaces.

## Task 1: bounded API, retained audit and actual transaction acceptance

**Files:** Task1 map above. **Consumes:** approved spec, existing auth/idempotency/schema, snapshotCte and typed evidence. **Produces:** the shared contract, operating GET modes/PATCH and actual SQL/race/session/HTTP acceptance. Sole native implementation, no parallel writers.

Test files own inline synthetic fixture helpers; no shared runtime bypass. Use id(n)=99010000-0000-4000-8000- plus n padded to12 digits: tenant1,company2,project3,Manager10,John11,Jason12,Chief13,IT17,Area21,retired descendant22,John assignment40/duplicate41,Jason grant50/assignment51. John has no relevant responsibility or acting grants in the happy path; Jason already covers Area21 and another Area. Script-owned disjoint cases may use random UUIDs after verifying their sentinel. Unit read/command helpers return parsed {status,body}, persisted() returns relevant rows/audit/ledger for comparison; do not substitute mocks for SQL evidence.

- [x] **Step 1: write read/route RED tests.** Named cases canonical_subject_token_across_links_modes_pages_search, single_statement_current_manager_authority, duplicate_assignments_not_grouped, retired_inactive_chief_dependency_visible, manager_plus_it_allowed_it_only_denied, strict_query_and_old_contract_dispatch. Assert complete totals, deterministic bounded pages, nonnegative safe offset/control-character/unknown/duplicate rejection and private/no-store success/errors. Read diagnostics show unsupported assignments without permitting mutation.

```ts
assert.equal(secondLink.snapshotToken,firstLink.snapshotToken);
assert.equal(reportingPage.snapshotToken,firstLink.snapshotToken);
assert.equal(searchPage.snapshotToken,firstLink.snapshotToken);
assert.deepEqual(areas.assignments.data.map(x=>x.assignmentId),[id(40),id(41)]);
assert.equal(inactiveRetiredChief.reporting.data[0].canUseStaffing,false);
assert.equal(itOnly.status,403);
assert.equal(managerWithIt.status,200);
assert.equal(oldChiefResponse.status,oldChiefExpectedStatus);
assert.deepEqual(oldChiefResponse.body,oldChiefExpectedBody);
```

- [x] **Step 2: observe read RED.** Run node --import tsx --test tests/tenancy/superintendent-area-read.test.ts tests/tenancy/superintendent-area-route.test.ts. Record missing new export/expected contract failure, not an unrelated tool/configuration error.
- [x] **Step 3: implement the minimum read/transport contract.** Produce the typed port, scoped canonical SQL read/application/GET handler and dispatcher GET wiring. Rows/count/checksum/current Manager proof share one statement; token state never depends on selected link, mode or pagination. Keep the original snapshotCte unchanged.
- [x] **Step 4: verify read GREEN.** Repeat Step2; old staffing read/command tests still pass and wrong tenant/project/member/subject/link returns scoped refusal, never guessed resource details.
- [x] **Step 5: write command/audit/route RED tests.** Named cases legacy_reuse_unlinks_exact_row, subtree_reporting_and_protected_refuse, duplicate_overlap_department_preserved, strict_witnesses_and_confirmation, current_authority_before_historical_replay, exact_replay_after_replacement_loss, stale_conditional_and_fault_rollback. Reject self/inactive/Sub/wrong-role/foreign replacement, incomplete/ancestor/department coverage, protected subject, nested/retired selected Area, nonFULL/ARCHIVED, unknown fields/invalid key/checksum and extra client Area. Unsupported FIELD_COORDINATOR/null-scope responsibility and any acting grant block; another exact-Area grant is retained. Legacy absence of a handover event is accepted.

```ts
assert.equal(result.body.assignmentId,id(40));
assert.equal(after.assignments.find(x=>x.id===id(41)).deactivated_at,null);
assert.deepEqual(after.replacementCoverage,before.replacementCoverage);
assert.deepEqual(after.rolesAccountsDepartmentsCrewsOtherAreasTickets,before.rolesAccountsDepartmentsCrewsOtherAreasTickets);
assert.equal(event.event_type,'survey.staffing_saved');
assert.equal(event.payload.version,1);
assert.equal(event.payload.action,'unlink-superintendent-area');
assert.equal(event.payload.replacement.provenance,'reused');
assert.equal(event.payload.authority.actorMembershipId,heldManagerMembershipId);
assert.equal(blocked.status,409);
assert.deepEqual(blocked.persisted,before);
assert.deepEqual(replay.body,result.body);
assert.deepEqual(afterReplay,beforeReplay);
assert.equal(revokedManagerReplay.status,403);
assert.equal(revokedSessionReplay.status,401);
```

- [x] **Step 6: observe command RED.** Run node --import tsx --test tests/tenancy/superintendent-area-command.test.ts tests/tenancy/superintendent-area-route.test.ts. Record the expected missing cleanup/atomic evidence/authorization behavior.
- [x] **Step 7: implement minimum command and audit.** Produce lock/authorize/unlink/PATCH contracts and dispatcher PATCH wiring. Historical current-actor gates precede ledger; fresh callback alone enforces active subject/replacement, live top-level exact witnesses, canonical checksum and subtree absence. Conditional false throws409; record event and result in the same real transaction. Add the approved version1 payload description to CLAUDE; retain all incumbent events. No coverage creation, auto-transfer, role mutation or schema change.
- [x] **Step 8: verify focused command GREEN.** Repeat Step6 and read/route tests. Negative tests prove no write/audit; same key/changed payload409, incumbent Chief key namespace independent.
- [x] **Step 9: write actual PostgreSQL acceptance harnesses.** General script owns --read-only/read versus full cases, actual legacy/duplicate/overlap/department/foreign-witness fixtures, subtree links with inactive/wrong-role Chiefs and retired nodes, visibility assertions, preservation and per-call failures injected at conditional update/audit/ledger. Each failed call owns a real transaction; compare persisted assignment/audit/ledger from another connection afterward. Concurrency script owns two-session tests with observed pg_blocking_pids, bounded statement timeouts and both winner orders against actual reporting save/unlink, coverage handover, role/account/company/session, Area move/retirement/level and selected/witness deactivation/revocation writers. Verify one success/one stale conflict, same-key one audit, held actual membership, FK compatibility and two-project shared-account no40P01. Session script owns post-wait expiration/logout/revoked-version before replay. Do not replace existing writers with a weaker imagined protocol.
- [x] **Step 10: run actual persistence/race/session acceptance.** Use the gated commands below; each exits0 with explicit PASS and observed waits/persisted absence of partial changes. If an incumbent writer defeats the approved lock contract, invoke systematic-debugging and stop that increment for a concrete spec revision; no speculative lock/retry/permission fix. Record inherited protocol acceptance honestly; only newly introduced behavior needs an observed RED before production implementation.
- [x] **Step 11: run production HTTP acceptance.** New script uses real cookies, private/no-store positive/negative GET/PATCH, legacy assignment, exact duplicate, foreign UUIDs, current Manager plus IT versus IT-only, replay/lost-response recovery, no creation and separately guarded role denial. Assert actual SQL audit/history after HTTP calls; existing handover/Chief HTTP regressions remain valid.
- [x] **Step 12: complete broader verification.** Run required builds/tests, incumbent SQL/HTTP regressions and existing staffing/workforce/reviewer browser regressions against valid disposable prerequisite profiles. Exit0 is necessary; inspect summaries and record actual counts. No Task2 UI success claimed yet.
- [x] **Step 13: obtain independent consequential review.** Invoke requesting-code-review, give the read-only reviewer spec/plan, base/current diff and root verification evidence. Reconcile findings under receiving-code-review; TDD fixes and fresh focused/full checks before acceptance. Independent review is evidence, not owner authority.
- [x] **Step 14: document the API checkpoint.** Record actual completed capability, checks/review/limitations in CODEX and status/audits; leave UI and broader protected/lifecycle/deployment gates open.
- [ ] **Step 15: commit and push the coherent API checkpoint.** Apply verification-before-completion, review diff/stage exact owned paths, commit feat: add bounded Superintendent Area unlink; git push origin phase5:phase5; fetch and verify equal HEAD/origin,0/0,clean. No force/reset or unrelated local paths.

## Task 2: Manager Area obligations and three-way command coordination

**Files:** Task2 map above. **Consumes:** Task1 DTOs/HTTP and existing Axiom/error/idempotency controls. **Produces:** bounded Manager evidence, explicit exact-row confirmation, stable retry and real desktop/mobile acceptance; IT-only UI unchanged.

**Interfaces:** apiClient.readSuperintendentAreas(projectId:string,input:SuperintendentAreaReadQuery):Promise<SuperintendentAreaReadResult> and apiClient.unlinkSuperintendentArea(projectId:string,input:UnlinkSuperintendentAreaInput,idempotencyKey:string):Promise<UnlinkSuperintendentAreaResult> use Task1 resource/modes/PATCH and Idempotency-Key.

New component export SuperintendentAreaObligations(props:{projectId:string;superintendentId:UUID;disabled?:boolean;isBlocked?:()=>boolean;invalidateVersion?:number;onLockChange?:(locked:boolean)=>void;onUnlinked?:(result:UnlinkSuperintendentAreaResult)=>void}):React.JSX.Element. Only selected Superintendent RoleEditor renders it, outside the role form. Add optional isBlocked/invalidateVersion to ProtectedSurveyObligations, preserving existing Manager/IT props. isBlocked supplies a current synchronous parent guard in addition to disabled props; onLockChange updates the parent ref immediately before starting the request, and remains true through uncertainty.

View exports initialSuperintendentAreaEditor():SuperintendentAreaEditorState, reduceSuperintendentAreaEditor(state:SuperintendentAreaEditorState,event:SuperintendentAreaEditorEvent):SuperintendentAreaEditorState, canConfirmSuperintendentAreaUnlink(state:SuperintendentAreaEditorState):boolean, superintendentAreaFailure(error:unknown):SuperintendentAreaEditorEvent. State owns superintendentId:UUID|null, detail/replacements/reporting: corresponding Extract<SuperintendentAreaReadResult,...>|null, originalToken:string|null, assignment:SuperintendentAreaAssignment|null, replacement:SuperintendentAreaReplacement|null, confirmed:boolean, generation:number, loading/stale/pending/uncertain:boolean, attempt:{input:UnlinkSuperintendentAreaInput;key:string}|null, error:string|null, result:UnlinkSuperintendentAreaResult|null.

Event union: person(superintendentId), load(generation), read(generation,data:SuperintendentAreaReadResult), assignment(assignment), replacement(replacement), confirm(confirmed), begin(key), retry/cancel/reload, readFailure(generation,message), stale(message?), failure/uncertain(message), success(result); each uses type equal to the named event. All definitive409 become stale; network/5xx becomes uncertain. Reducer freezes non-recovery events while pending/uncertain, validates generation/person, retains first token across all mode/page/link reads, and only deliberate reload resets stale. No automatic replacement or witness rebinding.

RoleEditor owns immediate role/reviewer/area lock refs plus rendered lock state. Child isBlocked checks the other two current refs; role submit checks child refs as well as readOnly/current running state. Scope uncertain-role payload/key preservation to this RoleEditor: freeze role/confirmation/dismissal after network/5xx, allow its unchanged retry through existing useTeamCommand, clear uncertainty only on definitive response/success. Do not refactor that hook's other consumers. Successful child command clears separate role confirmation and invalidates sibling evidence via invalidateVersion; sibling becomes stale/reload-required, never acquires a fresh token over an old draft. The successful child deliberately clears its own confirmation and reloads its current obligations.

- [ ] **Step 1: write reducer/browser RED tests.** Named cases original_token_survives_all_modes_and_cancel, stale_latches_until_deliberate_reload, late_other_person_link_page_ignored, frozen_exact_retry_preserves_witnesses_and_key, legacy_duplicate_preview_truthful, inactive_retired_chief_guidance, three_way_pending_uncertain_direct_submit. Reducer fixtures use Task1 IDs/token='a'.repeat(32); a changed token is 'b'.repeat(32). Browser script uses actual Task1 runtime/SQL, counts actual requests and persisted audit rather than merely disabled DOM controls.

```ts
assert.equal(candidateState.originalToken,'a'.repeat(32));
assert.equal(mismatch.stale,true);
assert.equal(reduceSuperintendentAreaEditor(mismatch,{type:'cancel'}).stale,true);
assert.equal(canConfirmSuperintendentAreaUnlink(mismatch),false);
assert.deepEqual(retried.attempt,uncertain.attempt);
assert.equal(retried.attempt.input.replacementAssignmentId,id(51));
assert.equal(lateReadState.generation,currentGeneration);
assert.equal(overlappingCommandRequestCount,0);
assert.equal(oneAssignmentAuditCount,1);
```

The browser's complete John-to-Jason path must first use the existing explicit review handover to add Area1 to Jason, then deliberately transfer/unlink dependent Chiefs using existing staffing, then deliberately reload/confirm one John assignment. Assert Jason's Area2 is unchanged, John is not demoted, and duplicates/other obligations still block the separately confirmed role change.

- [ ] **Step 2: observe UI RED.** Run node --import tsx --test tests/ui/superintendent-area-view.test.ts; run the new browser script against the Task1 production runtime. Record missing controls/reducer or missing three-way handler guard as expected failures before production UI changes.
- [ ] **Step 3: implement minimum view/client/component.** Implement interfaces above, bounded assignment/replacement/reporting searches/pages, exact UUID/coverage preview and one explicit confirmation. Display existing-tool guidance and unsupported/empty/loading/error/archived states. Retained department diagnostics do not promise scope removal; no missing-coverage or intent option here. Apply applicable Impeccable skill while preserving Axiom controls/layout; no new navigation/modal/assets/brand.
- [ ] **Step 4: implement RoleEditor coordination.** Wire only the selected Superintendent section and the narrowly optional protected-panel coordination. Synchronous cross-command refs plus buttons/handlers prevent direct duplicate/adjacent submits; pending/uncertain freezes edit/cancel/reload/dismissal, exact retry remains enabled. Successful cleanup reloads its own obligations, invalidates sibling draft and clears role confirmation without auto-demotion. Ignore late generations; heading/trigger focus and announced outcomes match existing controls.
- [ ] **Step 5: verify focused UI GREEN.** Repeat Step2. Run real production browser at1440 and390 widths, keyboard/focus/overflow/page-error checks. Exercise duplicate/overlapping rows, no-handover legacy, unavailable coverage, inactive/retired reporting, archived/unsupported states, page/search mismatch, genuine mutation409, cancel latch/deliberate reload, delayed old responses, duplicate requestSubmit and all six directed adjacent-command blocking cases during pending and uncertainty. Lost-response transport injection is labeled synthetic; mutation/auth/SQL remain real. Retry same payload/key recovers one actual event without new coverage.
- [ ] **Step 6: complete required regressions.** Fresh full tests/nonincremental TypeScript/Windows/Linux builds, Task1 SQL/race/session/HTTP and incumbent staffing/team/workforce/reviewer browser acceptance with valid disposable prerequisites. Use fresh owned profiles where a harness requires initial state; never loosen guards or use Sabine.
- [ ] **Step 7: obtain independent final review.** Request read-only consequential review of Task2 and the whole API/UI range; reconcile findings against approved sources, TDD approved fixes and rerun appropriate/full verification. No implementation delegated or parallel shared-state edits.
- [ ] **Step 8: update actual completion evidence.** CODEX/status/audits record behavior, fresh counts/runtime, review rulings and remaining lifecycle/deployment gates. Mark plan steps only from completed evidence; do not certify full departure or hosted/device acceptance.
- [ ] **Step 9: commit/push UI checkpoint.** Apply verification-before-completion; review/stage exact paths, commit feat: expose Manager Superintendent Area cleanup; push origin phase5:phase5, fetch/verify matching SHA,0/0,clean. Reassess the authoritative queue before another subsystem.

## Disposable Verification and Checkpoint Commands

Before execution, inspect current HEAD/fetch/count/clean and read actual script guards. The existing owned QA container swr-reviewer-ui-final-8e862527 is synthetic but must not be casually reset. Provision a fresh identity-verified owned PostgreSQL15 profile when initial-state prerequisites require it; loopback127.0.0.1:15489/swr_team_isolated with SWR_TEAM_POSTGRES=1 and test-only JWT_SECRET. Verify container labels/name, URL, empty initial population and test sentinel before mutation/migrations. If15489 is occupied, preserve or stop only the ownership-verified disposable QA resource; never touch Sabine15488/3106 or another retained profile. No retained .env; process env/credentials remain ignored, never printed/staged. No new dependency; external SWR_PLAYWRIGHT_MODULE and SWR_QA_CAPTURE=0 follow current harness convention.

New scripts refuse wrong URL/flag/sentinel, use their own99010000 fixture and never silently overwrite conflicting tenants. Seed only after the incumbent survey-teams fresh prerequisite; migrate current schema using node --import tsx db/migrate.ts with explicit disposable environment (not pnpm db:migrate loading .env). No new migration proof is necessary because no schema changes are approved. Incumbent staffing-read PostgreSQL/HTTP requires a separate fresh two-tenant/no-roster profile; preserve that guard and current accepted assigned-person404 KPI contract (Batch72).

At each implementation checkpoint inspect exit0 and actual result summaries:

```powershell
pnpm tsc --noEmit --incremental false
pnpm test
pnpm build
docker build --target runtime -t swrtracker-phase5-area-unlink-verified .
node --import tsx tests/beta/survey-teams-postgres.ts
node --import tsx tests/beta/superintendent-kpi-postgres.ts
node --import tsx tests/beta/survey-staffing-safety-postgres.ts
node --import tsx tests/beta/survey-staffing-unlink-postgres.ts
node --import tsx tests/beta/team-workforce-postgres.ts
node --import tsx tests/beta/workforce-repair-postgres.ts
node --import tsx tests/beta/protected-obligations-postgres.ts
node --import tsx tests/beta/protected-obligations-concurrency-postgres.ts
node --import tsx tests/beta/protected-obligations-session-postgres.ts
node --import tsx tests/beta/superintendent-area-postgres.ts
node --import tsx tests/beta/superintendent-area-concurrency-postgres.ts
node --import tsx tests/beta/superintendent-area-session-postgres.ts
```

For focused newly introduced behavior use the named test paths/--test-name-pattern; full pnpm test remains required because the runner intentionally imports tests together. PASS must include no failed/cancelled/skipped new cases; zero tested race cases is not acceptance. Observed waits, both winner orders and per-call persisted rollback are separate recorded evidence.

Start the current built native Windows production server (or built Linux image, explicitly identified) on127.0.0.1:3107 against that disposable database. Hidden background windows only. Record runtime/container ownership and stop only owned helpers when done. Safety HTTP precedes scripts mutating its fixture; names below are not authority to ignore preconditions:

```powershell
node tests/beta/survey-staffing-safety-http.mjs
node tests/beta/protected-obligations-http.mjs
node tests/beta/superintendent-area-http.mjs
node tests/beta/superintendent-kpi-http.mjs
node tests/beta/survey-staffing-http.mjs
node tests/beta/protected-obligations-browser.mjs
node tests/beta/team-workforce-browser.mjs
node tests/beta/workforce-repair-browser.mjs
node tests/beta/survey-staffing-unlink-browser.mjs
node tests/beta/survey-staffing-browser.mjs
```

Task2 additionally runs node tests/beta/superintendent-area-browser.mjs. Incumbent scripts may require separate fresh owned profiles after mutation; read current guards before executing. Unit mocks do not prove locks, browser transport injection does not prove outages, builds do not prove data authorization, and loopback desktop/mobile does not certify physical-device/assistive-technology/soak/hosted recovery/ACL/proxy readiness. Record actual counts and limits, not copied historical totals.

## Inline Self-Review and Handoff

Coverage: spec authority/read/query/checksum to Task1 Steps1-4; exact coverage/dependencies/ownership/audit/replay to Steps5-8; real rollback/writers/session/HTTP to Steps9-12; UI/coordination/stale/focus to Task2. All five Review Focus conditions have named owning tests. Shared signatures/fields match both tasks; exact audit action/version/witnesses and endpoint namespace are pinned. Tasks are independently testable API then UI, each includes review/documentation/push; no scaffolding-only checkpoint, production function bodies or unowned type placeholders.

Self-review corrections: preserve incumbent handlers/deps and body stream via transport dispatcher; cache metadata is additive at the resource boundary. Keep uncertain-role freezing local to RoleEditor rather than changing other command consumers. Parent guards read synchronous lock refs, not only post-render props. Sibling successful commands invalidate old drafts instead of clearing stale latches or rebasing tokens. Actual existing writer incompatibility is an explicit stop condition, not permission for unapproved locking architecture.

Plan prepared on clean fetched f9560f5, fresh424 tests/nonincremental TypeScript/native Windows production build pass. This is a documentation checkpoint: no new SQL/HTTP/browser/Linux result or production implementation claimed. Current owner approval closes the written spec only. Preserve Native execution; ask owner to review this concrete plan before invoking executing-plans. Broader Phase5, inactive/other protected/full multi-Area departure, retention and deployment remain separate gates.
