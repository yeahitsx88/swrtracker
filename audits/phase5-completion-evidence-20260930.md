# Phase5 completion evidence and remaining decisions

AUDITOR: source/read-only acceptance review after pushed implementation checkpoint `d046cd6f7ca13ead501b7678af3db9e874edd5db`. This is a requirements gap report, not a new security scan, permission expansion, production load certification or overall-completion claim. Source: owner refresh/KPI attachment6433b37f, Survey Authority attachment315f7153, Team Management attachmentc9e3ea04, direct Decisions11–18, PRODUCT.md and current source/test evidence. Older unchecked lists in KPI_PERFORMANCE_PROGRESS describe earlier stages; use this matrix for current evidence.

## Requirement mapping

| Requirement | Current evidence | Disposition / limits |
|---|---|---|
| Diagnose severe refresh hang before speculative architecture changes | lazy-pool binds stateful pg methods to their real receiver; prior reproduction and unit regressions; fresh12 query/idle-expiry cycles pass | Corrected implementation defect, not a demo-data excuse. No new cache/service justified by present measurements. |
| Avoid fetching all requests for initial Operations/KPIs | Operations initial chart aggregate; Manager separate activity feed; useTicketPage enabled only for selected queue; shared KPI details enabled on demand | Eight fresh cold/warm samples below show zero initial ticket calls. Assignment member choices and local messages remain deferred; those secondary APIs still return their existing lists, not a generalized paginated personnel/messages redesign. |
| Shared server-authorized population before filters/aggregation | resolve-visibility, ticket-visibility-clause, metrics-filter-clause and amelia-metrics.reader; denominator preserves other filters | Fresh49 temporary PostgreSQL cases and167 real six-account HTTP checks pass; no claim that these alone exhaust every public deployment attack path. |
| Five reusable visualizations and useful filtering | kpi-charts registry: heat/bar/trend/donut/share gauge; kpi-explorer with Area/type/status/crew/IM/date/population and turnaround | Implemented; mean turnaround intentionally has no donut/share gauge. Gauge is operational population share, not an invented SLA or productivity target. |
| Requester/field/Chief audiences and personnel boundaries | scoped-kpi-entry; server metadata and rejection of unauthorized personnel dimensions; own/company-authorized requests and Chief/IM current assignments | Implemented with recorded PostgreSQL/HTTP/browser coverage; Requester/IM don't gain comparative personnel authority. Broad readers may read scoped counts but do not gain Manager command activity. |
| Manager default Command dashboard | project-navigation Manager landing; survey-command-overview reuses initial metrics, coordinated dimensions and separate30-day/maximum90-day UTC activity | Implemented. Current-state backlog is all-date; activity dates do not carry into current-state drilldown. Instrument Man analysis is available in the shared explorer, not duplicated into the compact command filter row. |
| Superintendent workload and explicit linked crew population | Decision14, supportsLinkedCrewScope; current reporting link AND authorized Area scope applied to aggregate/facets/details | Implemented and separately labeled. Prior isolated20 PostgreSQL/15 HTTP plus real-stack browser cases prove linked boundaries. Sabine individual links remain deliberately unassigned; linked view may honestly be empty. Existing All Requests landing remains unchanged. |
| Reliable metric definitions and coverage | first submission/recorded completion activity; cycle validity/provenance exclusions; bounded200 groups/120 months and truncation labels | Implemented. Historical assignment timing, true backlog history and employee completion attribution cannot be reconstructed from imported current-state snapshots; these are deferred, not fabricated. |
| Compact historical review / search / navigation | coordinated read-only filters, chart drilldowns, Requests tab/pages, one-row chart lane with grid toggle, account overlay/greeting and frozen popout Close | Current real-Sabine navigation810/390/1902 and eight scroll cases1440/390 pass. Impeccable reviews apply at their recorded extension/fix-list scope, not whole-product certification. |
| Manager staffing and organizational teams | Decisions13/17/18: existing members, fixed roles, one active organizational team, explicit Chief Area/reporting/IM additions and exact-link cleanup | Implemented narrow flow with367 unit tests and real-stack tests. Roles/removal remain confirmed; Requester retained. Teams never grant authority. Protected department/responsibility/acting obligations and appropriate cross-Area moves are not silently cleared. |
| Sample project org structures | Three one-page PDFs inspected; CAD excluded; no identities imported | Assistants without email are support headcount, not generated/authorized users or request-log users. Lead titles/subtiers need the owner's modeling decision; current four-role authority is unchanged. |
| Scoped report/print exports | Decision15 backlog | Not implemented, explicitly lower priority. Requires agreeing an authorized whole-filtered-population export contract; printing only the current page is not silently called a full report. |
| Requested red-team follow-up | D:/Programming/SWRTracker/audits/red-team-assessment-brief.md reread; existing security source checkpointf01040b and CODEX Batch47/DEPLOYMENT record remediation of all11 local findings | This audit does not revalidate vulnerabilities. Trusted ingress/source limiting, actual recovery delivery/worker and provider TLS/network/dependency controls remain deployment acceptance, not a local-preview promise. |

## Fresh local load samples

Current Linux production image `swrtracker:sabine-unlink-20260930`, ID `sha256:2bbcbb0e12d87c57ad56f3205b8c47e692156e9d31e28e20f45da38f60d14385`, loopback3106. Headless installed Windows Edge, no CPU/network throttling, one Manager login reused only for these checks and revoked afterward. New browser context per surface/width; warm sample is a reload in that context. No screenshots or production-code changes. Body lengths are decoded API bytes, not transferred/compressed bytes. Last API completion excludes the browser's extra network-idle wait. PerformanceObserver LCP is observed load output, not field percentile/INP/React hydration duration.

| Width / surface | Cold TTFB / LCP / final API ms | Warm TTFB / LCP / final API ms | API calls / decoded bytes / initial ticket calls |
|---|---|---|---|
|1440 live Manager|12.2 /104 /356.7|10.3 /36 /281.8|4 /30,716 /0|
|390 live Manager|9.7 /48 /328.6|9.1 /32 /257.8|4 /30,716 /0|
|1440 historical review|11.3 /52 /245.3|9.6 /36 /189.0|3 /19,986 /0|
|390 historical review|8.1 /48 /248.5|7.8 /40 /180.3|3 /19,986 /0|

All eight samples: API200, no page errors, no document overflow, zero observed long tasks and one project-list call. Live's two metrics calls have different purposes: charts and daily activity, not a duplicate chart fetch. Historical review uses its separate review aggregate. Prior baseline recorded live272,584 API bytes and historical direct Operations201 ticket calls/33,644,895 bytes; the current default surfaces have changed deliberately, so do not treat these as controlled same-scene benchmark ratios. The ordinary historical review now fetches no detail page until needed.

The current historical chart HTTP sample is12,198 decoded bytes/117ms, with14,506 valid cycle samples;167 role/filter/detail-equality checks pass across six accounts. All49 SQL scenarios use explicitly qualified pg_temp fixtures rolled back on exit; public records are not mutated. After every acceptance sequence all20,109 public request IDs/statuses/row versions retain fingerprint `22fcffc03ee306d3b65c8c3eda4997b3`.

## Performance audit boundary

- Trace/Lighthouse insight MCP tools are unavailable; useful network/source/PerformanceObserver analysis continued per web-perf skill. No DevTools trace, React hydration profiler, interaction latency/INP, throttled physical-device result, field percentile or concurrent-user load run was collected. No CWV rating/threshold guarantee is assigned to these local samples.
- Earlier SQL EXPLAIN evidence found existing indexes sufficient at20,025 historical rows; this report has no fresh plan comparison for every new aggregate/activity query. Don't add indexes, Redis or materialized views without measured need.
- Accessibility evidence here is the existing browser keyboard/focus/overflow tests, not a fresh full accessibility-tree/contrast audit. No extra self-polish round or token-system drift repair was performed.
- Repeated idle pool expiration is freshly verified; eight navigation loads are not a many-hour soak or concurrency test. No regression observed in the exercised local paths; meaningful rollout testing remains distinct.

## Decisions and next safe boundary

The assistant/CAD population rule is settled. The remaining chart question is whether Lead Superintendent/Lead Party Chief are organizational display titles within existing fixed roles, or additional persisted reporting tiers. Recommend display-only titles first: preserve current explicit permissions and avoid granting authority from a chart label. A real additional tier would require defining permissions, cardinality, Area intersection, delegated powers, fixed-role compatibility, API/schema changes and migration behavior; don't implement that without owner direction. Do not classify every Surveyor/Rodman/expediter/clerk as an Instrument Man automatically.

Keep protected-grant administration and individual Sabine mapping explicit. Broader product completion and deployment certification remain separate from the finished exact-link checkpoint. Stop new hierarchy/permission implementation at this decision; preserve the tested preview and current branch. Fresh same-scene query-plan/load/interaction coverage is the next independent validation work once that focus is agreed, not a reason to invent infrastructure or write real staffing links.

### Owner decision follow-up

Decision19 resolves the chart question above: display-only titles for now; retain existing authority roles. The former chart-tier gate is closed, not a blocker. Labels do not grant Area/reporting access, modify priority, create accounts or make Lead Superintendent equivalent to Survey Manager. Supporting assistants still have no assumed login/request-log access. The historical matrix above records its pre-answer state; this follow-up is authoritative for the title decision. A new editable title contract/schema, protected-grant administration and real Sabine mapping are not approved by this answer. Continue safe validation independently; do not invent additional tiers.

### Query-cost follow-up

Fresh27 read-only plan samples across nine current chart/activity/review cases are recorded in `dashboard-query-cost-20260930.md`. Narrow chart populations repeatedly scan tenant import-event rows; two query-only alternatives were investigated without source/data changes. The projected alternative preserved six sampled JSON results but had mixed timing and temporary-disk costs, so it was not shipped. This supersedes the no-fresh-plan limitation only for those cases, not the remaining concurrency/interaction/deployment boundaries. Final TypeScript and367 tests pass; preview and20,109-request fingerprint unchanged.


## 2026-10-01 continuation evidence - protected reviewer first slice
Decision28 native execution produced verified API42f84b5 and shared Manager/IT UI acceptance (CODEX Batch73).424tests/nonincremental TypeScript/Windows+Linux production builds and current disposable migration/SQL/HTTP/browser evidence advance this narrow capability. Tests prove explicit exact-Area coverage creation/reuse, retained atomic audit/retry, current authority and stale/frozen UI semantics, without assigning real personnel or altering Sabine.

Whole Phase5 is not complete. Full Superintendent departure cleanup/other protected contracts, authoritative individual Sabine reporting mapping, lower-priority scoped exports and hosted recovery/ACL/proxy/soak/device/assistive-technology acceptance remain separate queue/gates. Historical checklists and earlier counts above are historical evidence, not fresh results for this checkpoint.


## 2026-10-01 final approved handover review and current queue - Batch74

CURRENT HEAD: assessment base4cbf08e44a28f51dff39cd4179ac215531e98862, following pushed API42f84b5 and UI4cbf08e; the verified parent-command repair and this record form the next ordinary phase5 checkpoint. No reset/merge/force push or original dirty checkout changes.

KNOWN-GOOD BASELINE: after the two-line parent-busy repair,424 unit tests, nonincremental TypeScript, native Windows and Linux runtime production builds and75 real-session handover browser checks pass. Earlier fresh migration/SQL/two-session/session/HTTP/incumbent browser results are specifically Batch72/73 evidence, not claimed as rerun after this UI-only fix. Independent whole-range reviewer personally verified424/27focused/TypeScript/diff-check at4cbf08e; executor verified the repair via browser RED-to-GREEN and full suite/builds. No remaining final review findings; no Sabine cutover or deployment certification.

COMPLETED / DO NOT REPEAT: current scoped KPI/reporting populations, Manager command views and Team Management, guarded fixed-role changes, protected additive staffing and Chief exact-link unlink, workforce/member KPIs, navigation, requester draft/correction/recovery/date and earlier isolation/attachment/redaction repairs. Decisions27/28 now add supported one-grant Survey Reviewer handover with Manager/IT authority, explicit missing additional-Area coverage, truthful temporary/permanent evidence, atomic audit/replay and shared controls. Whole Phase5 remains unfinished.

APPROVED + UNBLOCKED: finish and push the verified parent-busy correction/final review record. No further implementation task remains in the approved handover plan. Candidate work in the original continuation instruction is not blanket approval of unspecified contracts.

APPROVED BUT GATED: complete Superintendent departure still needs an explicit residual Area/reporting/crew cleanup contract (Decision27); acting/FIELD_COORDINATOR/department resolution still lacks executable replacement/department/audit rules. Broader central IT account/company/member/invitation lifecycle and consolidated permissions/investigation need a bounded approved design for the selected capability. Lower-priority report/print exports have approved direction (Decision15), but require an agreed whole-authorized-filtered-population output contract and design. Sabine reporting requires authoritative individual mappings. Hosted recovery/ACL/proxy/soak/device/assistive-technology acceptance requires owner-controlled environment/evidence, not local fixture inference.

DEFERRED: automatic draft/temporary-coverage expiry, permanent draft deletion, attachment purge/orphan cleanup absent retention policy, fabricated reporting/staffing, display-title/team-derived permissions, broad Manager grant administration, generalized roles/RBAC, Manager account invitations, unapproved hierarchy/infrastructure/indexes/refactors.

NEXT RECOMMENDED INCREMENT / WHY: select a design for exact departing Superintendent individual Area unlink, only after confirmed complete replacement coverage and explicitly resolved reporting dependencies. It finishes the operational departure path adjacent to the approved handover instead of opening another subsystem. Other Area/crew/team/role/account/request history remains separate. Owner authority is needed because this deliberately removes retained request visibility and Decision27 excludes that behavior.

Viable scope choices: (1) narrow explicit Area unlink after existing reporting cleanup, recommended; downside is multiple deliberate steps and possible remaining role blockers; (2) design combined Area/reporting handover, with a larger atomic contract and risk surface; (3) leave departure gated and choose another separately scoped design such as export or central IT lifecycle. Exact next decision: whether to proceed with the narrow Superintendent Area-unlink design, not approval of unseen implementation. No further independent sufficiently specified implementation was found; read-only investigation remains possible without crossing this decision.

### Execution rulings retained before ignored workspace cleanup

The following are the complete ledger rulings in decision order. Existing tests/builds prove the selected implementation, not excluded contracts. Final whole-range declined-to-judge subjects are ruled explicitly below; none silently became work.

- Ruling: User checkpoint review/push policy and approved plan override inline skill's end-only review/ask-before-security/push defaults — authorization is explicit; independent reviews at both consequential boundaries, no parallel writers. Cost if wrong: extra review overhead; no permission expansion.

- Ruling: Normalize installed CRLF shell scripts only in ignored .local copy and run via Git Bash; never modify plugin files — Windows-compatible execution. Cost if wrong: ledger bookkeeping failure, no product behavior.

- Ruling: incumbent SP KPI HTTP assertion (Batch52 expected200/zero for unassigned Chief) conflicts with later approved Batch66 assigned-person validation and accepted workforce route tests404. Reproduced actual404 at pre-existing metrics route; source untouched. Update only stale HTTP assertion to404, preserve request-list empty-population200 and broad scope. No visibility widening; needed to unblock required regression.

- Ruling: inline focused fixtures avoid unnecessary helper; bounded separate race/session scripts preserve acceptance ownership. Old staffing-read requires independent fresh two-tenant/no-roster profile; preserved regression cluster, switched only identity-verified QA profiles then restored. No production scope change. Concurrency ledger assertion scoped to tested actor/endpoint after HTTP created unrelated synthetic history; no weakened authority or product fix.

- Ruling: review replay acceptance gap is valid under Step8. Added existing-behavior evidence after independent replacement role/account/session/company and protected-subject changes; no new behavior so no artificial RED.191actualSQL total GREEN. Deferred-review rulings preserve all listed owner gates, pending UI, generic duplicate witness contract, no global logout serialization and hosted/device/soak limits; no item silently adopted.

- Ruling: optional onLockChange/disabled props coordinate only adjacent existing role form so uncertain/pending handover cannot be dismissed or overlapped by role save; no authority change. Closed Manager role entry offers read-only role/obligation evidence, mutation fields disabled. Cost if wrong: unnecessary read UI, no backend visibility widening.

- Final whole-range review e1568f2..4cbf08e: independent 424tests/27focused/tsc/diff-check GREEN; no Critical/Important persistence/security findings. Parent-busy omission classified Minor by reviewer. Ruling: regrade missing parent-command handover freeze Important for the approved interaction contract (already promised adjacent command coordination, not extra polish) — prepared handover can bypass existing disabled integration — cost if wrong: one bounded regression/build checkpoint rather than deferral. Actual browser RED: parent pending disables handover confirmation false != true while genuine role PATCH409 response held. Minimum fix honors disabled in final button and synchronous submit guard, preserves uncertain unchanged retry.

- Final: Ruling: complete Superintendent departure, residual Area visibility, crew/reporting cleanup and request reassignment stay gated — Decision27 excludes them — cost if wrong: remaining role blockers require a new design instead of immediate removal.

- Final: Ruling: acting/FIELD_COORDINATOR/department/generalized administration stay excluded — no executable coverage/department/audit contract — cost if wrong: those blockers remain unresolved.

- Final: Ruling: account/orphan lifecycle, arbitrary grants, broader inheritance and automatic expiry stay outside scope — no approved contract/retention policy — cost if wrong: another separately scoped increment is needed.

- Final: Ruling: no global in-flight logout serialization or generic assignment uniqueness claim — accepted incumbent concurrency model and migration011 allow that limitation — cost if wrong: future lifecycle writers require a new concurrency contract.

- Final: Ruling: Sabine deployment/hosted recovery/ACL/proxy/soak/physical-device/assistive-technology acceptance remain unclaimed — only disposable local evidence exists — cost if wrong: rollout acceptance remains unfinished.

- Final: Ruling: pending plan Step6 is bookkeeping, now mark complete — actual4cbf08e push was verified SHA/0:0/clean — cost if wrong: documentation would overstate landing, prevented by rechecking remote before final commit.

- Final: Ruling: do not invoke branch integration menu or remove managed checkout — user requires continuous phase5 checkpoints and finishing skill only at actual integration decision — cost if wrong: branch integration remains pending, no history/data loss.

For rulings whose original line omitted a cost: the KPI expectation choice risks overlooking an intended zero-result contract (later accepted tests/source establish404); fixture/assertion scoping risks reducing regression coverage (separate prerequisite profiles preserve it); replay acceptance without artificial RED risks an unproven regression test (existing behavior acceptance is unchanged, actualSQL191 exercised it). Deferred minors from final review: none. Unrelated pre-existing Impeccable sidecar radius drift remains deferred; no token redesign was authorized.
