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
