# Phase5 review reconciliation

Date: 2026-10-01. Implementation branch: phase5.
Reviewed input: docs/PHASE5_REVIEW_BRIEF_20261001.md at origin/phase5-261001-review, commit1b9b61aabda4a20a85e01584446da1524016502e, based on92e5b45.
Current verified checkpoints030a654 and917f2b7 are newer than that assessment. Original brief remains intact on its review branch.

## Conclusion and authority

Accept the concrete defects and proportionate security controls. Reconcile against requirements R01–R11 and Decisions32–34, rather than treating the brief's older baseline as current authority. The owner requested this assessment/reconciliation and continued development, then explicitly selected **fresh Survey review and approval** after direct-assignment return/resubmission (A1). Native execution continues; production/Sabine cutover, retained data changes, new vendors, retention/purge and reactivation remain outside approval.

Single-person stacked Central IT/Project Admin/Manager roles remain approved. Four-eyes approval is an optional future governance decision, not a new requirement. RLS, hash chains, MFA, scanners and broad SaaS onboarding are not prerequisites to the bounded approved offboarding implementation. Important pilot deficiencies remain visible release gates rather than being represented as already fixed.

Disposition vocabulary: **Now** = accepted bounded correction underway; **Lifecycle** = integrated into approved Tasks3–7; **Pilot** = required follow-on design/acceptance before real-requester pilot; **Owner** = concrete policy/vendor decision required; **Rollout** = later assessment, no implied implementation. Only entries with recorded GREEN verification may be reported fixed.

## Findings A–D

| Item | Assessment and reconciliation | Disposition / proof gate |
| --- | --- | --- |
| A0 | Reproduced exactly54 advisories:3 critical/31 high/18 moderate/2 low. Registry latest Next15.5 is15.5.27; bcrypt6 is6.0.0. Next pins old PostCSS and may reuse old Sharp, so direct upgrades alone are insufficient. | Now: Next15.5.27/bcrypt6, narrow PostCSS8.5.28/Sharp0.35.5 overrides; current audit0 known. Retained bcrypt5 hash/new cost12 compatibility passes. GREEN frozen install, Windows build and optimizer HTTP, fresh read-only candidate review, and clean pinned Node22.23.3 Linux image (audit0/types/466 tests/build/native bcrypt and AVIF/runtime HTTP). CI configured; remote run pending. |
| A1 | Confirmed direct SUBMITTED has no exit. Owner chose fresh Survey review/approval. Preserve SWR ID, public reference and variant; add SUBMITTED→APPROVED/return/cancel, APPROVED→assignment/return/cancel, deny SUBMITTED→ASSIGNED. | Now: liveness and selected correction-cycle tests RED→GREEN. GREEN application correction cycle retains SWR ID/reference/variant/first submission, refuses early reassignment and records resubmit→approve→assign. Final SQL/HTTP retained-state acceptance remains; no live-ticket repair authorized. |
| A2 | Confirmed saveMembership overwrites role on conflict; endpoint lacks one held transaction and protected role-change semantics. | GREEN insert-only409 for existing membership, including disabled rows; actual PostgreSQL proves role/access stamps unchanged. Guarded role changes remain separate. Add atomic administrative audit/session transaction and actual Manager continuity. |
| A3 | Confirmed arbitrary scalar admin fallback and ticket overwrite. Task2 recipient gating did not remove this writer. No silent replacement is approved. | GREEN escalation-only worker; retired repository writer cannot update tickets; truthful workflow.orphan_escalation event. SQL detects locally disabled/missing memberships and preserves assignments. Lifecycle: tenant-coordinated durable escalation remains. |
| A4 | Confirmed Chief visibility excludes approved-unassigned Area work. The proposed fix also needs an action authority check: assignTicket currently requires assigned Chief, so visibility alone is insufficient. | Pilot: explicit responsible-Area Chief/coordinator queue plus bounded existing assignment action, archived/company/tenant fences and relationship tests. No general all-project Chief visibility. |
| A5 | Confirmed requester cancel clears crew without stop-work notice. | GREEN use case queues captured pre-cancel Chief/IM stop-work notices and requester notice with distinct idempotent keys. Final SQL rollback/retry proof and transport are pending under Tasks3/7 and B7. |
| A6 | Confirmed public tenant bootstrap. | GREEN public POST returns404 before parsing payload or database access; controlled repository bootstrap tooling remains. No new bootstrap secret surface unless separately designed. |
| A7 | Reproduced Unicode ByteString500 after audit. | Now: ASCII fallback plus RFC8187 encoding, construct valid response before audit. Unicode/invalid-header tests RED→GREEN. Server response preparation is auditable; client receipt cannot be guaranteed. |
| B1 | Confirmed ordinary broad-role visibility admits other people's DRAFTs. Explicit admin draft-recovery surface is separate. | GREEN shared ordinary views/files predicate admits only own unsubmitted drafts; actual PostgreSQL Manager/Viewer/CAD tests and incumbent binding/isolation tests pass. Scoped recovery remains separate; final HTTP matrix pending. |
| B2 | Confirmed direct requester lacks effective project eligibility. A subcontractor's legitimate company attribution is not inherently a leak. | GREEN direct use case requires effective same-project Requester identity before numbering/writes; retains truthful same-tenant company attribution. Disabled effective membership is verified by real SQL. Do not invent a categorical subcontractor ban; test legitimate invited requester and denied nonmember/disabled/wrong role. |
| B3 | Confirmed captured field reviewer is the only review actor; offboarding must include that current duty. | Lifecycle blocker now; Pilot fallback design: current scoped Survey override with reason/audit, never automatic replacement. |
| B4 | Confirmed pending stop-work flag has no decline and survives corrections. | Pilot: explicit decline with reason and clear lifecycle for return/cancel/resubmission; preserve original flag history. Do not silently erase evidence. |
| B5 | Confirmed active assignment may clear IM and strand field work. | GREEN clearing IM denied in ASSIGNED/IN_PROGRESS/DELAYED before writes; existing approved PC-only staging and legal assignment retries pass. |
| B6 | Confirmed title/whitelist priority conflicts with R07/superseded rule; resubmit resets Survey decision. | GREEN automatic title/whitelist substitution and misleading audit removed; initial NORMAL, resubmit retains Survey priority/provenance. Obsolete expectations replaced with policy regressions; no retained rows changed. |
| B7 | Confirmed ticket outbox only captured locally; worker alerts and password-reset webhook do not deliver normal ticket outbox. | Pilot/Owner: durable delivery using approved transport contract, retries/lease/failure view; provider/channel/sender approval required. Local preview is not delivery acceptance. |
| B8 | Confirmed rolling UTC instant rule and differing POST/PATCH parser. | GREEN POST and PATCH use the same existing calendar parser, including its documented legacy ISO calendar-day compatibility. Owner/Pilot: project IANA zone and calendar versus working-day rule, earliest-date endpoint/UI, DST tests. |
| B9 | Confirmed account-only lockout; unprovisioned ingress is not protection. | Pilot: trustworthy source boundary, per-source progressive limits, bounded persisted state and abuse tests. Owner deployment topology needed; never trust arbitrary forwarded IP. |
| B10 | Confirmed headers missing. | GREEN frame denial/nosniff/referrer/permissions verified on actual production HTML/API/optimizer responses. Pilot: compatible CSP/reporting remains. HSTS belongs at verified TLS edge; avoid enabling unsafe HTTP-preview assumptions. |
| B11 | Confirmed identity audit gaps and mutable incumbent audit tables. New account_lifecycle_events already reject UPDATE/DELETE/TRUNCATE under031. | Lifecycle/Pilot: truthful separate admin audit for invite/register/member/grant/config effects; protect ticket/access/staffing events and separate deployment privileges. Don't fabricate ticket IDs or events. |
| C identity lifecycle | Initial invite only, no existing-user project acceptance/admin reset/reactivation. | Lifecycle preserves current rows and blocks invite restoration. New GC onboarding/existing-user acceptance/admin reset are separate follow-ons; reactivation remains owner-designed, not included now. |
| C stacked roles | Single scalar role cannot stack Project Admin with Manager. | Already integrated:031 independent grants and917f2b7 capability gates. Broader multiple operational roles remain R04 responsibility design, not fabricated scalar roles. |
| C retention | No approved purge schedule; ledger full bodies indefinitely. | Owner: record-class retention/legal hold; no destructive TTL job. Minimize future responses where compatible with exact retry guarantees; never invalidate current frozen retries silently. |
| C attachments | Declared MIME/extension only; buffering/quota/scanning concerns are valid. | Pilot magic-byte verification; Owner/Rollout scanner, streaming/quotas/storage choice. File bytes/history stay retained. |
| C Superintendent stop-work | Current role refusal differs from broad error text; R05 review authority is not every cancellation power. | Pilot/Owner: clarify scoped initiation/approval roles, then implement matrix/UI/copy together. No silent elevation. |
| D malformed IDs | Ticket creation/notification/login identifiers inconsistent. | Now/Pilot: shared UUID validation and400 semantics at boundaries; retain deliberate404 non-disclosure for inaccessible resources. |
| D maximum lengths | No bounded text/filename lengths. | Pilot: explicit limits across parsers/UI/SQL; account offboarding reason already10–1000. Don't truncate historical content. |
| D draft cancel | Kernel permits DRAFT cancel while approved UI uses soft-delete. | Pilot: reconcile canonical draft action and compatibility before removing retained transition behavior. |
| D migration runner | No mutual exclusion/checksum and no runtime db directory. | Lifecycle release gate: dedicated migration artifact/job, advisory lock and immutable migration checksums; app image need not carry DDL if dedicated migrator does. |
| D Node parity | Runtime22 and local24 differ. | GREEN pinned22.23.3 Debian clean image/native runtime and Windows development checks; final release image must be reverified after remaining development. Avoid claiming local build proves Linux runtime. |
| D JWT secret | Placeholder/short secret accepted; verify algorithm implicit. | GREEN HS256 pin and short/placeholder production-secret refusal with regressions. Pilot: deployment rotation runbook. kid/managed store are separate operational design. |
| D build artifact | Tracked tsconfig.tsbuildinfo. | GREEN generated cache untracked and ignored; local cache retained, no source/data deletion. |
| D documentation | Stale root CLAUDE on main; old locks conflict with CAS; Decision21 gap. | Lifecycle documentation: CAS plus tenant-first barrier, superseded sections explicit, merge check for root instruction file. Record numbering gap without inventing an approval. Do not edit unrelated main checkout. |

## Every standard-practice recommendation

All recommendations below have a disposition; advisory practices are not retroactive requirements or claims of completed assurance.

| Reference item | Recommendation | Reconciliation / gate |
| --- | --- | --- |
| 3.1.1 | Prompt dependency patching/SLAs | Now A0; record critical7/high30 day target as proposed operational policy, not an attested SLA. |
| 3.1.2 | Dependency monitor/audit CI and Docker gate | Now local/CI high-severity gate with no silent exceptions; monitor configuration reviewed with repository workflow. |
| 3.1.3 | Digest pin/minimal production image/worker bundle/image scan | Pilot deployment work; verify registry digest and Linux binaries, not guessed digest. |
| 3.1.4 | CodeQL/Semgrep | Pilot assurance backlog; choose repository-native CI capability, no unapproved vendor. |
| 3.2.1 | Password length/blocklist/72-byte boundary | Owner/Pilot auth policy. Keep retained hash compatibility; do not prehash existing accounts or force reset. |
| 3.2.2 | Privileged MFA/SSO | Owner/Rollout; SSO expressly excluded from current phase. |
| 3.2.3 | Account/source progressive limits | Pilot B9 with trusted ingress/source model. |
| 3.2.4 | Session kill/sign out everywhere | Lifecycle immediate current account/version checks and disable bump; self global signout remains follow-on. |
| 3.2.5 | Secret strength/kid/rotation/managed store | Production config check now; Owner operational rotation/store choice. |
| 3.2.6 | Pin JWT HS256 | Now compatible verification hardening with rejection test. |
| 3.3.1 | Shared deny-by-default decisions | Lifecycle A2/A3/B1 and enforcement manifest; semantic action guards, not a cosmetic helper-import lint. |
| 3.3.2 | Exhaustive authorization matrix | Lifecycle A01–A40/P01–P15, plus Pilot workflow role/status/relationship matrix. |
| 3.3.3 | PostgreSQL RLS | Rollout evaluation with transaction context/reset/performance tests; query fences remain mandatory. |
| 3.3.4 | Separate migration/runtime DB privileges | Lifecycle/Pilot deploy gate. Trigger proof is not production privilege certification. |
| 3.3.5 | Host/slug tenant identity | Rollout design; current authenticated mutations derive tenant from session and don't accept actor/tenant overrides. |
| 3.4.1 | Joiner/mover/leaver flows | Lifecycle bounded reversible disable now, existing guarded movers; separate onboarding/reset/reactivation designs later. |
| 3.4.2 | Quarterly recertification | Rollout report/attestation design; no unsolicited recurring task or outbound messages. |
| 3.4.3 | Stale temporary grant visibility | Rollout reminder/report only; preserve approved no automatic expiry. |
| 3.4.4 | Four-eyes/affected-person notices | Owner/Rollout; two approvers would conflict with current independent/stacked actor approval. |
| 3.4.5 | Break-glass procedure | Owner/Rollout, audited emergency design; no routine disable bypass. |
| 3.5.1 | Reachability/liveness safety tests | Now A1 kernel test; Pilot operational actor liveness includes B3/B5. |
| 3.5.2 | Named owner/fallback/flag decline | Pilot B3/B4 explicit scoped override design. |
| 3.5.3 | Waiting-state timers/age/escalation | Pilot without automatic reassignment. |
| 3.5.4 | Active work requires assigned IM | Now B5 use-case guard; assess compatible legacy DB constraint separately. |
| 3.5.5 | Ledger minimal body/TTL | Owner retention and replay contract;24–72 hours is a suggestion, not approved TTL. |
| 3.5.6 | Concurrency single source | Lifecycle docs: compare-and-set plus tenant-first barrier and action-specific row locks. |
| 3.6.1 | DB append-only audits/privileges | Lifecycle account audit already enforced; incumbent audit hardening and release roles remain gates. |
| 3.6.2 | Hash chains/anchoring | Rollout evaluate evidentiary benefit/operational cost; no fabricated claim of tamper evidence. |
| 3.6.3 | Complete event catalog/mutation tests | Lifecycle identity/admin audit; Pilot per-action matrix; truthful effect/event pairs. |
| 3.6.4 | Audit on successful validated effect | Now A7; transaction audit for mutations. Response prepared is not confirmed recipient receipt. |
| 3.6.5 | Trusted DB time/NTP | Lifecycle DB transition/audit time; Pilot host time configuration. |
| 3.7.1 | Security headers/CSP/HSTS | Now/Pilot B10, TLS-edge HSTS contingent on real ingress. |
| 3.7.2 | Origin/Fetch-Site defense | Pilot shared mutation boundary and proxy/browser tests, including upload/logout/notifications. |
| 3.7.3 | Shared input validators | Now/Pilot UUID/date/length validation; existing helpers first, no new schema dependency needed. |
| 3.7.4 | Remove public/legacy surfaces | Now A6; Pilot tested public route inventory and obsolete Area stubs. |
| 3.8.1 | Magic bytes | Pilot allowed formats/OOXML container checks, false-positive fixtures and upload limits. |
| 3.8.2 | Malware scanner | Owner/Rollout service choice and quarantine lifecycle. |
| 3.8.3 | Safe download encoding | Now A7 regression. |
| 3.8.4 | Streaming/byte quotas | Rollout design; no new quota silently rejects existing retained content. |
| 3.8.5 | Durable storage/backups | Owner/Pilot local volume versus already-allowed object storage, DB/file restore proof. |
| 3.9.1 | Real durable ticket transport | Pilot/Owner B7; lifecycle review has distinct durable outbox, never fake ticket IDs. |
| 3.9.2 | SPF/DKIM/DMARC | Owner/Pilot domain/transport configuration; no unauthorised DNS edits. |
| 3.9.3 | Field inbox/badge/prominent stop-work | Pilot UI/notification design and connectivity acceptance. |
| 3.9.4 | Requester-facing display names | Pilot copy contract tests with no private/internal status leakage. |
| 3.10.1 | Project zone/calendar versus workdays | Owner/Pilot B8; persist verified IANA zone and test DST. |
| 3.10.2 | One Need-By parser/date contract | Now shared existing parser; stricter date-only public contract needs caller migration, not a surprise break. |
| 3.10.3 | Server minimum date | Pilot after date policy; config-version/stale UI acceptance. |
| 3.11.1 | Retention schedule | Owner legal/contract record-class policy; no purge authority. |
| 3.11.2 | Legal hold | Owner/Rollout before any purge; avoid premature unused schema. |
| 3.11.3 | Minimize ledger/log PII | Pilot response minimization with replay regression; Owner TTL. |
| 3.11.4 | TLS DB/encrypted volumes/backups | Pilot deployment checklist and actual configuration proof. |
| 3.12.1 | RPO/RTO/PITR/restore drill | Owner/Pilot controlled disposable restore, DB+attachment hashes; never restore over Sabine. |
| 3.12.2 | Safe locked/checksummed release migrations | Lifecycle/Pilot D migration work; additive031 not deployed until all consumers pass. |
| 3.12.3 | Health/SLOs/alerts | Pilot backlog/outbox age/job staleness/configured thresholds; no unsolicited monitoring service. |
| 3.12.4 | Incident/restore/rotation/account runbooks | Pilot operational docs with Owner recovery policy. |
| 3.13.1 | ASVS L2 checklist | Rollout assessment target; no assertion of conformance from unit tests. |
| 3.13.2 | Disposable DAST | Pilot isolated environment only; not a scan against retained/production deployment. |
| 3.13.3 | Property/model workflow tests | Now liveness; Pilot randomized authorized transitions/history invariants. |
| 3.13.4 | Independent penetration test | Owner/Rollout external assurance, especially before public exposure/second tenant. |
| 3.14.1 | axe/manual screen-reader | Pilot accessibility proof on actual flows, not screenshot inference. |
| 3.14.2 | Offline/throttled reconnection | Lifecycle frozen retries plus Pilot field stop-work/reconnect acceptance. |
| 3.15.1 | Authoritative docs/superseded root | Lifecycle clean up relevant rules and merge gate for root CLAUDE. |
| 3.15.2 | Decision log links/Decision21 | Document unexplained gap honestly; link implementing checkpoints, never invent decision content. |

## Execution order

1. Finish bounded review corrections A0/A1/A2/A3/A5/A6/A7 and compatible B1/B2/B5/B6/parser hardening, with failed regressions first and current checks afterward.
2. Resume approved Task3 all-writer coordination, then Tasks4–7 offboarding/review/parity/UI and integrated acceptance. A2/A3 are explicit required integrations; no milestone closes with them unresolved.
3. Keep pilot policy/transport/operational gaps above as explicit separate gates. Produce concrete follow-on designs before changing authority, adding services, purging data or claiming a pilot-ready release.
4. Final independent whole-branch review still required; A0 candidate review is additional scoped evidence, not a substitute.

This document records dispositions and evidence to date. It does not claim all recommendations are implemented or that deployment is approved.
## Review checkpoint verification

- Windows:467/467 normal tests, nonincremental TypeScript, production build; actual HTML/API/optimizer responses confirm compatible headers and image decoding. No known vulnerabilities in current production audit.
- Linux: clean Node22.23.3 Debian Docker build with frozen lock, audit0,466 tests/types/build; bcrypt5 retained hash accepted by6, Sharp0.35.5/libheif1.23.5/libvips8.18.7 and AVIF roundtrip pass. Production login200, unauthenticated API401, local image optimizer200, disallowed remote image400. Disposable probe container removed.
- Isolated PostgreSQL:28 migration invariants plus13 review checks pass in a rolled-back unique schema. Fixture intake omission was corrected without weakening constraints.
- Fresh A0 read-only candidate review found no concrete dependency bypass/regression. Reviewer registry access was denied; independent primary and Docker audits succeeded. Evidence saved through Codex Security supplemental artifact storage.
- Task3 remains in progress: immediate common auth checks and lock primitives are present; complete writer coordination, administrative audit and races are still mandatory. Tasks4–7 and final whole-branch review remain open. This checkpoint is not pilot/deployment approval.