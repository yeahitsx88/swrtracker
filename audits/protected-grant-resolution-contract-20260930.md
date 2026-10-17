# Protected-grant resolution: contract assessment

Read-only source assessment following owner Decision20. The IT-only boundary is approved; this document does not implement removals or authorize a new replacement/coverage policy.

## Confirmed boundaries

- `src/lib/access-administrator.ts` recognizes active central IT (`TENANT_ADMIN`) or IT assigned to this project (`PROJECT_ADMIN`). Survey Manager is not an access administrator.
- `change-survey-role.ts` refuses current crew/reporting/individual Area/responsibility/acting obligations. Cleanup must remain a separate command; it must not demote users or rewrite requests/history.
- Responsibility and acting grant rows retain revocation timestamps/actors. Department memberships and Area assignments retain deactivation timestamps. No hard deletion is necessary.
- Closed projects, expired/revoked sessions, stale displayed evidence, wrong tenant/project/subject, and changed administrator authority must refuse mutation. Authorization must precede idempotent replay.

## Evidence requiring a concrete contract

1. `project_responsibility_grants` supports `SURVEY_REVIEWER` and `FIELD_COORDINATOR`. The current review helper consumes explicit Area `SURVEY_REVIEWER` grants for Superintendents, with Survey Manager role authority handled separately. Source search found no runtime consumer of `FIELD_COORDINATOR`. A stored grant alone is therefore not proof of executable field authority.
2. `acting_grants.scope` is arbitrary JSONB. The older specification describes action lists and Area constraints but does not define a validated JSON contract. Current source reads acting grants for diagnostics, notifications and role-removal obligations; it does not resolve them into workflow authority. Guessing that `{}` means project-wide operational coverage would invent a permission rule.
3. The Area-assignment schema permits either a user or a department, never both. `roleObligations` counts rows belonging to the user; a shared department-wide Area row cannot be that person's direct blocker. An individual department membership is a separate record and is not currently counted by this role-removal guard. Removing a shared department grant would affect other members, not merely the selected person.
4. `access_grant_events` already allows responsibility revocation, but has no payload for the selected replacement, coverage proof or prior scope. Its allowed actions do not include acting or department removal. `survey_staffing_events` has a different, restricted event contract. Full replacement-aware history requires an explicit additive audit schema/contract change, not a misleading existing event.

## Recommended first implementation contract (not yet approved)

- A bounded per-person blocker view for Manager; an IT-only, one-current-obligation resolution command with explicit confirmation, displayed-state checksum and stable retry key. No bulk cleanup, inferred replacements, account invitations or expanded Manager authority.
- Require IT to select an already-authorized replacement, distinct from the departing person, with validated authority for the same Project and complete affected Area/action scope. This cleanup command creates no replacement role/grant. Unsupported responsibility types and unrecognized acting scopes remain blocked with a specific handoff explanation until their authority contract exists.
- Treat per-person department membership separately from shared department-wide Area grants; keep shared grants unchanged in this staffing-removal flow. Whether department membership should newly block survey-role removal needs an explicit owner choice, rather than silently changing the guard.
- Add narrowly scoped append-only resolution audit evidence (previous obligation, selected replacement, coverage proof, confirmer and time), committed atomically with soft revocation/deactivation and the existing idempotency ledger. Apply any approved additive migration only to a fresh disposable verification database first; no Sabine reset, historical rewrite or real staffing mutation.
- Lock/recheck administrator authority, current subject, selected obligation and coverage evidence in the transaction. Existing grant/role/Area writers must be accounted for before claiming race-safe coverage; a UI-only check is insufficient.

## Next gate

Owner Decision20 remains accepted. The outstanding gate is the exact replacement coverage rule, department target semantics and the additive audit contract needed to preserve that proof. No production/API/schema/UI files were changed by this assessment. The verified `aaed8df` phase5 checkpoint remains the preview implementation.


## 2026-10-01 responsibility-only scope follow-up

The owner replied "Continue" to the proposed SURVEY_REVIEWER-only first slice with already-authorized same-Area replacement and retained atomic prior/replacement/coverage/confirmer/time evidence. Decision24 records this scope approval; it does not resolve acting or department semantics. The previous all-types contract gate is now narrowed: write and review the responsibility-only specification, keeping unsupported obligations protected.

Proposed written design: [Survey Reviewer resolution](../docs/superpowers/specs/2026-10-01-survey-reviewer-resolution-design.md). It makes the conservative coverage witness, UI/API/replay/locking and additive audit choices concrete for owner review. Current source requires individual Area request visibility as well as SURVEY_REVIEWER authority for executable review; a stored responsibility grant alone is insufficient proof. Specification approval and the later implementation-plan gate remain outstanding. No resolution endpoint, schema or UI is implemented by this follow-up; fb45827 is the synchronized source checkpoint, not a new Sabine deployment.


## 2026-10-01 Survey Manager authority revision

Decision25 records the owner's explicit direction to allow the current project's Survey Manager to resolve the responsibility-only first slice alongside central/project IT. It supersedes this assessment's historical IT-only/Manager-read-only recommendation for supported SURVEY_REVIEWER resolution only. The same replacement-coverage, confirmation, atomic evidence and historical-preservation requirements apply; acting/FIELD_COORDINATOR/department contracts remain gated.

The [revised written design](../docs/superpowers/specs/2026-10-01-survey-reviewer-resolution-design.md) adds purpose-specific Manager authorization without widening assertAccessAdministrator or unrelated administration. It proposes the existing editable personnel population, live authority/session/company checks held through commit, authority-branch audit evidence, direct Team Management controls, and negative tests for other-project/former/subcontractor Managers and unrelated IT endpoints. These are written-design proposals pending review, not implemented controls. No production source, schema, grant, role, retained dataset or preview changes in this checkpoint.


## 2026-10-01 additional-Area coverage revision

Decision26 supersedes the previously proposed pre-existing-coverage-only restriction: the Manager may temporarily assign an eligible current Superintendent an additional Area while retaining their existing Areas. The [revised specification](../docs/superpowers/specs/2026-10-01-survey-reviewer-resolution-design.md) proposes explicit reuse versus additional-coverage modes, a person-based selection/payload, creation of only missing exact-Area review and individual visibility rows, and departing-grant revocation/audit/retry in one transaction. New authority is explicitly confirmed and audited, never inferred or issued through a standalone grant editor. Existing IT scope remains alongside the Manager branch.

Temporary-until-manual-handover is proposed for review; no automatic expiry, acting semantics, department mutation or successor inference is introduced. Existing role guards still require separate departing individual Area/reporting/crew cleanup; current Chief unlink and setup-only IT Area routes are not a complete active-project Superintendent departure path. This limitation is explicit rather than weakening guards.

Schema evidence: migration022 already supports RESPONSIBILITY_GRANTED/REVOKED and an active exact-grant unique index; migration011 allows duplicate individual assignments. The proposal extends retained JSON evidence to handover-created grant events as well as resolution events. Competing generic inserts, atomic creation/audit failures and unchanged retries after later revocation require actual disposable-database acceptance. No runtime/schema/retained-data mutation in this documentation checkpoint.


## 2026-10-01 written-spec approval and implementation-plan handoff

Decision27 records owner approval of the revised responsibility handover specification atb4548e5, including project Survey Manager authority, explicit missing additional-Area coverage and confirmed manual end of temporary cover. The previous written-spec gate is closed for that exact first slice; acting/FIELD_COORDINATOR/department and complete Superintendent departure cleanup remain gated. [Implementation plan](../docs/superpowers/plans/2026-10-01-survey-reviewer-handover.md) is prepared for owner review/execution selection, requiring two verified pushed implementation checkpoints (API/audit, then shared Manager/IT UI). No implementation, migration application or runtime/concurrency certification is claimed.


## 2026-10-01 implemented first-slice follow-up - Decisions27/28
API checkpoint42f84b5 and shared controls (CODEX Batch73) implement the approved exact top-levelArea SURVEY_REVIEWER creation/reuse handover. Current project Manager and existing IT authority, executable review+individual coverage, explicit TEMPORARY/PERMANENT intent/manual handover and nullable correlated access-event evidence are settled only for this slice. Actual negative/rollback/two-session/session/HTTP/browser evidence verifies the documented contract locally.

Earlier unresolved items remain applicable to acting/FIELD_COORDINATOR/department resolution, broader lifecycle and complete Superintendent departure: this handover retains departing individual Area/reporting/crew/team/role/account/ticket state. Do not interpret this follow-up as approving their cleanup/transfer. No Sabine mappings or hosted acceptance inferred.


## 2026-10-01 narrow departure design direction - Decision29
The owner selected explicit Manager Superintendent individual Area unlink after confirmed complete replacement coverage and deliberate reporting resolution. This closes selection of the next design direction, not the written contract or implementation gate. The [proposed specification](../docs/superpowers/specs/2026-10-01-superintendent-area-unlink-design.md) removes one individual assignment with retained current coverage/dependency evidence and existing staffing audit semantics. It does not reinterpret or remove acting/FIELD_COORDINATOR/department grants; unsupported dependencies refuse cleanup. Existing Manager/IT reviewer handover stays implemented at0f3ab1e. Separate role changes/other obligations, written-spec/plan approval, real mapping and hosted acceptance remain distinct.


## 2026-10-01 written-spec approval and plan follow-up - Decision30
The owner approved the concrete f9560f5 Superintendent individual Area-unlink written specification. Earlier Decision29 direction-only gate is now closed; the [implementation plan](../docs/superpowers/plans/2026-10-01-superintendent-area-unlink.md) remains for owner review before Native execution. Two sequential checkpoints own exact scoped API/audit/real transaction acceptance, then Manager evidence/confirmation/three-way command coordination. No implementation, new authorization/schema or retained-state mutation. Fresh unchanged-source424 tests, nonincremental TypeScript and native Windows production build pass for this documentation checkpoint; no fresh Linux/SQL/HTTP/browser acceptance claimed. Other protected/lifecycle/complete departure/retention/hosted gates remain.


### Superintendent individual Area cleanup - approved API checkpoint (2026-10-01)
Decision31 approves the two-task plan and Native execution. The API now lets the actual current project Survey Manager inspect bounded individual Area obligations and explicitly soft-unlink one eligible assignment only after exact-Area review/individual replacement coverage is complete and dependent reporting/protected obligations are resolved. Manager+IT qualifies through the actual project Manager role; IT-only is denied. Duplicate/overlapping individual coverage, other Areas, departments, accounts, roles, crews and request history remain preserved. Historical exact retries retain current actor/session/project gates and create no replacement coverage. Existing Chief staffing and reviewer handover remain separate.
Fresh root verification and independent API review: CODEX Batch77 and audits/superintendent-area-unlink-completion-20261001.md. Manager UI/three-way coordination was outstanding at the API checkpoint; its verified implementation is recorded in the following Task2 section/Batch78. Complete departure, other protected contracts, account lifecycle and hosted/device acceptance remain gated. No retained Sabine data or preview change.


### Superintendent Area cleanup Manager controls - verified Task2 (2026-10-01)
The approved Decision31 API is now consumed in the selected Superintendent's Manager RoleEditor. Separate bounded assignment/replacement/reporting evidence names exact UUIDs, duplicate/overlap counts, reused coverage and existing-tool guidance. Explicit confirmation removes only one individual assignment. Current displayed token survives mode/page/search/cancel; mismatches and current definitive read/command409 retain a write block until deliberate reload. Pending/uncertain role, handover and cleanup commands freeze each other through synchronous handler guards and UI state; only unchanged own retry remains available. Successful cleanup reloads its evidence, invalidates the sibling handover draft and clears separate role consent without automatic demotion.
Fresh441 tests, nonincremental TypeScript, Windows/Linux builds,98 new actual desktop/mobile browser checks and relevant real SQL/HTTP/incumbent regressions pass. Independent code/visual/documentation evidence and limits: CODEX Batch78 and audits/superintendent-area-unlink-completion-20261001.md. This completes the approved bounded plan at local acceptance scope, not complete departure, every protected type or hosted/device acceptance. Remaining acting/FIELD_COORDINATOR/department/inactive-former cleanup, central IT lifecycle/investigation, real Sabine mappings, lower-priority exports and deployment need their own concrete contract/evidence. Retained Sabine is unchanged.
