# Continuity and recovery investigation

Date: 2026-10-02 America/Chicago. Scope: synthetic Northbank rehearsal and disposable PostgreSQL acceptance fixtures. This extends the earlier operational report; it does not rewrite that operating history or establish production readiness.

## A. Findings and evidence

**FACT — Taylor retained membership and history.** Northbank was archived by Casey Brooks at 2026-10-03 01:59:53.931 UTC (October 2, 8:59:53pm Chicago). Taylor remains an active Survey Manager with an eligible company, enabled project access and enabled tenant account. The launcher previously queried only ACTIVE projects. Direct authorized historical request access still worked. Including permitted ARCHIVED projects restores discoverability without unarchiving or changing authority.

**FACT — administrative scale exposed a usability limit.** The independent admin/candidate selectors previously stopped at 100 records. Pagination now exposes the whole authorized population. Requested personnel order, collapsible sections and searchable/sortable record tables replace long flat lists. Selection stages named actions for review; each administrative action commits separately, and partial completion is explicit. Access removal retains individual blocker previews and confirmations rather than treating selected people as one unchecked disable.

**FACT — coordinated movement was missing as a single guarded operation.** Existing staffing, reporting, Area and named-team APIs required operators to assemble several updates. A bounded Manager-only command now previews and atomically coordinates supported crew and Instrument Man moves. It uses existing application/repository operations under the tenant lifecycle barrier.

**FACT — secure password recovery already existed.** Actual handlers, encrypted mail outbox, local delivery capture, reset completion, password login and old-session rejection were exercised. No replacement recovery system was introduced.

**UNKNOWN — external delivery and support operations.** No configured external delivery service or established Axiom support recovery channel is demonstrated by this rehearsal. The owner approved capture-only internal testing and made delivery a beta gate. The owner also approved a registered organizational recovery contact, two independent provider recovery officers and Axiom customer support as the fallback entry point. Operational contacts, evidence handling, tooling and rehearsal remain gates.

**INFERENCE — the empty launcher was a discovery defect, not a firing/handover defect.** This follows from the archived project record, Taylor's current enabled membership and successful historical access. No membership or ticket history was repaired by direct database edits.

**ASSUMPTION — staffing follows current explicit project configuration.** Existing FULL/MEDIUM/SLIM rules, actual Manager continuity and recorded request assignments remain authoritative. Synthetic fixtures do not establish real customer preferences or productivity.

## B. Departure continuity matrix

| Departure | Existing supported path | Continuity boundary / evidence |
| --- | --- | --- |
| Central IT | Another eligible Central IT administrator independently manages tenant access | Final eligible tenant administrator remains protected. Project authority cannot substitute for tenant authority. All administrators inaccessible invokes the approved support policy, whose execution is not implemented. |
| Project Admin | Central IT assigns a replacement independent Project Admin; separately disables departing project/tenant access | Last local Project Admin removal is not a universal hard blocker. Current Central IT can recover local administration without joining the project. Operational roles and history remain independent. |
| Survey Manager | Guarded existing-Superintendent appointment with explicit outgoing Manager and coverage recipient; then separate offboarding | Actual successor required; unresolved protected duties block promotion. No implied acting Manager or permission from a Project Manager title. Historical tickets remain unchanged. |
| Superintendent | Resolve reporting, Area/reviewer and other protected obligations through existing guarded workflows; then preview/offboard | Live duties prevent unsafe removal. Unsupported or ambiguous obligation configurations require explicit resolution, not guessed reassignment. |
| Party Chief | Resolve current crew/reporting/Area and active-work obligations; then preview/offboard | Current duties block unsafe disablement. Recorded completed request ownership, events and attachments remain historical. |

Disposable acceptance exercises last-administrator and last-Manager gates, protected promotion, supported succession, Chief/Superintendent duty blockers and Project Admin recovery. The original Jordan/Sam departures remain separately evidenced in the operational report.

## C. Manpower movement model

The current actual Survey Manager can preview and confirm either an intact Chief-led crew's Area/Superintendent movement or an Instrument Man's current crew movement. A reason, explicit confirmation and SHA-256 snapshot bind the command. It takes the EXCLUSIVE lifecycle barrier, rechecks current session/role authority before idempotent replay, and commits staffing, reporting, Area and applicable named-team changes together.

Preview includes affected people, existing structure and active work. Unsupported/ambiguous named teams or Area coverage block the command. An Area-changing crew move with active assigned work is blocked until that work is resolved or explicitly reassigned through the existing ticket workflow. Same-Area reporting changes and Instrument Man roster changes preserve recorded ticket assignments. Historical assignments are not automatically rewritten to match today's roster. Existing explicitly assigned IM visibility remains governed by the ticket authorization model.

Exact retry returns the prior result. Stale snapshots require reload. Audit failure rolls back roster, named-team and idempotency changes. Archived projects remain read-only for staffing. This is a coordinated operator workflow, not an automatic workload optimizer or new organization permission model.

## D. Password and emergency recovery

Existing verified-email recovery uses random single-use expiring reset tokens, stored token hashes, encrypted outbox delivery, generic non-enumerating public responses, cooldown/rate limits and session-version invalidation. Disposable tests prove malformed, expired, reused and disabled-account rejection; successful reset rejects the old password and old session while preserving request history. Reset payloads are erased after capture delivery. Tokens and credentials are absent from retained public evidence.

Owner decision: local capture only during internal testing; verified external delivery before beta. Owner-approved emergency authority requirements and remaining execution gates are in [EMERGENCY-RECOVERY-POLICY.md](EMERGENCY-RECOVERY-POLICY.md). Contacting Axiom support starts recovery; it does not itself confer tenant ownership or bypass verification. No support takeover endpoint, master password or undocumented database recovery is introduced.

## E. Changes

- Archived project discovery and history-oriented role landing; independent administration retains the Admin landing for combined Requester/Admin identities.
- Requested personnel ordering and mounted collapsible sections; authorized record tables with filter, sort, pagination and selection. Existing admin API pages replace the fixed 100-record cap.
- Named batch review with exact frozen retries and explicit partial completion. Company-authority commands accept validated optional idempotency keys and retain current authority checks before replay.
- Archived company-access overview remains visible while mutation gates remain intact.
- Manager-only coordinated staffing preview/command/UI, immutable staffing evidence and writer-manifest classification. No schema migration, new role, historical reassignment or unarchive feature.
- Reusable rehearsal scripts, disposable acceptance cases, retained-state hashes and this report. Original dirty checkout and production data remain untouched.

## F. Verification

Baseline: 549 normal tests and strict TypeScript passed before this investigation's changes. Current normal suite: 554 tests. Linux Node 22 production build and strict TypeScript passed. New disposable continuity/recovery acceptance: 30 passing checks, plus 28 schema assertions. Existing PostgreSQL suites passed: offboarding policy 44, account-offboarding commands 76, project administration 56 (each also runs 28 schema assertions), and actual separate-client concurrency 33. Counts are suite checks, not an invented unique total.

The new fixture runs actual route/application/repository code and independent SQL assertions inside disposable schemas. It proves atomic failure rollback, stale evidence, unauthorized and foreign-project denial, archived mutation rejection, exact command replay, movement history preservation, password lifecycle and continuity gates. Fixture setup and completion-state preparation are direct SQL and are not presented as human workflow execution. Existing concurrency coverage uses separate connections; the new fixture's shared-connection checks alone do not establish concurrency behavior.

Browser evidence: real synthetic password sessions for Taylor, Casey and a Party Chief, archived history navigation, requested section order, disclosure, filtering/sorting/selection and desktop/mobile layout. See `browser.json` and role-specific PNGs. The initial browser batch passed 25 checks; the final corrected-image batch passed 28. The initial batch's three reloads per role measured Manager 570–586ms, Project Admin 679–681ms and Chief 570–574ms to network idle. Navigation-to-network-idle measurements include a fixed quiet interval and are not Core Web Vitals, production capacity or a human usability study. Enabled staffing command and batch mutations are verified in disposable route/SQL fixtures; the retained archived project is not made editable to demonstrate them.

The initial pre-download witness matched eleven table hashes. Final retained checks match ten full table hashes and every original ticket-event row, plus archive metadata. Two attachment-verification passes legitimately appended 160 attachment.downloaded audit events; no original events changed. The expected Northbank record totals remain 1598: 1502 completed, 44 canceled, 7 active and 45 drafts. A further 160 actual attachment byte-match and unrelated-company denial checks passed after runtime replacement (`files.json`). The original operating report remains the source for 49 represented shifts, 650 requesters, 15 crews, workload/KPI findings and prior attachment round trips. Review evidence cannot be used to infer actual customer behavior.

Independent UI review found three material issues: archive editing versus inspection controls, request configuration appearing editable on archive, and one-way command ownership between movement and existing editors. They were corrected together and the same desktop/mobile views were recaptured; the reviewer scored all three fixes resolved, disposition SHIP at the scored-fixes scope (`ui-review.md`).

## G. Decisions

**Approved:** synthetic continuity investigation, requested admin UI behavior, bounded coordinated movement, secure existing password recovery, capture-only internal email, external delivery beta gate, organizational recovery contact, dual independent provider approval and Axiom support fallback before beta.

**Open / beta gates:** establish and verify Axiom support channel and recovery contacts/operators; approve controlled evidence storage/retention and disputed-ownership handling; implement narrowly authorized recovery execution and witness a full rehearsal; verify external email delivery. These are recorded rather than silently implemented.

**Deferred:** unarchive, custom roles/individual permissions, SSO/MFA, broad workforce optimization and unrelated rollout hardening remain governed separately.

**Rejected as an implementation approach:** guessed replacements, operational role inference from a management title, email-domain-only ownership recovery, silent historical reassignment, automatic tenant disable after project disable, authorization bypass and ad hoc unaudited database takeover.

## H. Closed-beta assessment

Internal synthetic review can continue on localhost:3116 with preserved archived history. The scoped fixes and disposable acceptance improve continuity evidence; they do not close every pilot gate or establish production readiness. Closed beta remains gated on external recovery delivery, established Axiom support, approved operational recovery details, executable emergency recovery and its independently witnessed rehearsal, plus the previously governed rollout requirements. Recommendations are not automatically authorized implementation.
