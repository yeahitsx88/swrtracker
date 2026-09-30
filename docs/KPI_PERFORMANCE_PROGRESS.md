# Refresh performance and role-scoped KPI work

Status: in progress. This records the full requested outcome, not a completion claim. Source: owner-provided `pasted-text-1.txt`, attachment `6433b37f-fd44-4b05-af0f-d3e23f6aeb0f`. Existing approved product rules and Axiom identity remain authoritative.

## Verified investigation — 2026-09-29

### Primary hang: lazy database pool receiver

The running Sabine application timed out a login API call after 30 seconds, while its static login page responded in 4.8 ms from Windows and about 30 ms inside the Linux container. A fresh container-to-PostgreSQL `SELECT 1` took 14.7 ms. PostgreSQL showed no blocked application sessions; the web process was idle, not CPU-bound.

`src/lib/db.ts` returned unbound `pg.Pool` methods through a Proxy. Methods ran with the proxy as `this`; replacing state such as the pool's client array wrote to the proxy target, while reads continued returning the original pool's state. Expired clients remained counted. Once that stale count reached the pool maximum, callers queued without a usable connection.

An isolated real PostgreSQL reproduction with maximum two clients and 40 ms idle expiration succeeded on cycles one and two, then timed out on cycle three with two counted clients, zero idle clients and one queued waiter. Binding methods to the real pool succeeded on all four comparison cycles. This is an implementation defect affecting production as well as the demo; it does not depend on ticket volume.

Implemented `createLazyPool` to preserve lazy initialization but bind callable properties to the actual pool. Two unit tests fail against the old behavior and pass with the fix. The opt-in Linux/PostgreSQL lifecycle smoke passes 12 query/idle-expiry cycles, each returning client and waiter counts to zero. No retries, new services, authorization changes, or data mutations were introduced.

### Separate scaling issue: fetch-all Operations loader

After fixing the pool, measured authenticated desktop Chromium/Edge on Windows against the Linux production build, no throttling. The history Operations route was intentionally visited directly as a VIEWER to inspect its early data-loading behavior; it is not normal navigation for that role. Later member/metrics endpoints correctly rejected that role, but only after the entire authorized historical ticket list had downloaded.

| Path | Ticket API calls | Decoded API bytes | Last resource completion | Observed LCP |
|---|---:|---:|---:|---:|
| Live Operations, cold browser resources, 84 tickets | 1 | 272,584 | 328 ms | 172 ms |
| Live Operations, warm browser resources | 1 | 272,584 | 209 ms | 44 ms |
| Historical All Requests, 20,025 tickets, first page | 1 | 33,836 | 79 ms | 40 ms |
| Historical Operations, direct route | 201 | 33,644,895 | 3,154 ms | 3,168 ms |

The browser's network-idle completion adds approximately 500 ms and is not reported as application readiness. These are single local samples, not field Core Web Vitals percentiles or proof of mobile performance. No long tasks were observed. The initial CDP CPU subtraction crossed navigation metric resets and produced invalid negative deltas; discard that CPU comparison. No DevTools MCP trace/insight tools were available; browser resource timings, PerformanceObserver, source tracing and PostgreSQL EXPLAIN were used instead. INP and a full hydration profiler have not been measured.

Live API payloads: tickets 134,794 bytes, member roster 82,895 bytes, notifications 51,297 bytes, metrics 3,326 bytes, project memberships 272 bytes. Operations currently waits for all ticket pages before fetching the other three payloads. The tab/page-size UI only slices data already downloaded. No charting dependencies or reusable charts were found; the existing heat map is hand-rendered HTML.

PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` on 20,025 historical tickets: count 1.383 ms (index-only scan), late page at offset 20,000 8.382 ms (backward created-at index scan), status aggregation 1.879 ms (index-only scan). Existing tenant/project/status and created-at indexes are used. These results do not justify Redis, materialized views, or new indexes yet. Repeating authentication/count/list/name queries for every downloaded page is avoidable. Requester names are batched per page, not an individual-query-per-ticket N+1 pattern.

### Current authorization findings

- Ticket list access uses `getProjectRole`, active-session validation, `resolveVisibility`, and a repository SQL visibility predicate. It intersects company restrictions with role, Area, department, requester or crew assignment scope.
- The current metrics route instead allows tenant admin, project admin and Survey Manager, then aggregates the whole tenant/project without ticket visibility scope. Project Admin has no inherent ticket visibility in the specification. Do not extend this shortcut to Requesters or crew roles.
- Requester company-authority grants are existing behavior and must remain part of the authorized dataset. Ordinary Requesters remain own-request scoped.
- Party Chiefs see directly assigned tickets. Instrument Men see their current chief's assigned tickets plus their directly assigned tickets. Preserve this data visibility, but do not expose other Instrument Men comparisons.
- Superintendent and Area Viewer data are constrained to existing assigned Areas and descendants. Department roles retain department restrictions. No role names or additional authority should be invented.

## Remaining implementation and proof checklist

- [x] Read repository/product instructions, inspect loader, query paths, authentication, visibility, chart dependencies and indexes.
- [x] Diagnose, reproduce, fix and regression-test pool exhaustion; activate corrected local web image without deleting database or attachment volumes.
- [x] Replace Operations fetch-all loading with server-filtered, bounded pages; load only the selected tab and requested dialog details. Preserve search, Area/status/priority filters, ordering, page sizes, expandable rows, and workflow buttons. Completed Batch 28; see query-foundation update below.
- [ ] Centralize the existing authorized ticket predicate for both operational queries and reporting. Require server-resolved identity/scope, never client-supplied role or allowed-ID lists. Prove filters only narrow scope, including tampered URLs/API calls.
- [ ] Add targeted server aggregation and bounded filter-option queries. Keep tenant/project isolation, soft-deleted draft handling and consistent population definitions. Do not send all tickets to calculate KPIs.
- [ ] Preserve the KPI pop-out and heat map; add reusable bar, line/trend, donut and performance-gauge renderers driven by the same typed server result. Avoid one-off authorization logic in chart components.
- [ ] Support applicable Area, request type, crew/Party Chief, Instrument Man, status, date range, open/completed population and turnaround measures. Hide and reject personnel dimensions for roles without authority; derive options from authorized data only.
- [ ] Define units, scope, date basis, active filters, missing completion-date coverage and gauge denominator visibly. Gauge must describe an operational measure, not invent a productivity score or SLA target. Counts are not employee productivity.
- [ ] Provide sensible defaults, loading/error/empty/partial-data states, invalid-filter validation, keyboard access and mobile chart layouts within the existing Axiom design.
- [ ] Test Requester, Instrument Man, Party Chief, Superintendent, broader management/read roles, admin-only denial, wrong tenant/project, company isolation, revoked/deactivated access and malformed/personnel filters. Include real PostgreSQL and HTTP evidence, not only SQL-string assertions.
- [ ] Measure before/after ticket calls, payload sizes, query plans and load times on live and historical-size data. Verify repeated idle refreshes and no workflow regression.
- [ ] Update repository docs/log and deliver the requested final report: root cause, performance changes, visualization architecture/types/filters, role scopes, tests and remaining limitations.

No full-objective completion is claimed. Next coherent batch: bounded operational ticket query filters and shared visibility composition, then scoped reporting and reusable chart UI. Do not infer that passing legacy tests proves new KPI authorization or visualization requirements.

## Added owner requirement — Survey Authority default dashboard

### Query foundation update

The ticket API now accepts server-side `queue` (open/assignment/completed/overdue), `areaId`, `status`, `priority`, `ticketType`, literal `query`, and `sort=operations` filters. Default list behavior remains created-date ordering, now with an ID tie-breaker. Operations order preserves HIGH-first/Need-By ordering and adds an ID tie-breaker. Counts and pages use the same parameterized predicate, after existing tenant/project/role/company visibility constraints. Search includes request number/details/contact and a tenant-scoped requester-name lookup. Integer pagination is validated (limit 1–200, nonnegative bounded offset); malformed/duplicate filters return 400 instead of being partially parsed.

Validation at the query-foundation stage: Linux TypeScript, production build and 268 tests pass; read-only PostgreSQL acceptance passes 124 count/page/isolation checks across six Sabine roles, and real HTTP acceptance passes 60 checks including malformed-filter rejection. Batch 28 subsequently removed the browser fetch-all path using active-tab server pages, on-demand drill-downs and deferred messages/rosters (269 tests). Reporting scope remains pending. No personnel-filter permissions or new crew ownership were inferred. No schema changes.

Source: owner attachment `315f7153-c16b-45b2-8b9e-0c210fcbbdbe/Pasted text.txt` and Customer Ticket Traffic Management Dashboard reference screenshot. This extends the active objective; it does not replace the pool repair, pagination, visualization framework, or role-scoped analytics work above.

### Required product outcome

- Preserve existing personal/request, field and crew experiences for roles without broader oversight. Do not globally replace current stat tiles, drill-downs or operational tabs.
- Give authorized Survey Authorities a default Survey Operations Command Dashboard for their assigned crews. Derive the landing capability server-side, using existing authority where supported. Do not automatically grant this experience or data scope to higher administrative/read-only roles.
- Enforce `Survey Authority Authorized Crews → Authorized Requests → Dashboard Metrics` on the server before aggregation. User filters can only narrow this population. Crew IDs, URLs and client state cannot expand it.
- Compose several useful information areas: request status/exception counts, supported turnaround and assignment/completion timing, request distributions, demand-versus-completion trends, and authorized crew-level analysis. Use existing states and CTS/CAD relationships only; do not invent states or fabricate metrics unsupported by reliable data.
- Provide an immediately useful default: all authorized crews, all applicable request types, a recent activity range (30 days is the owner's suggested example), active work and relevant recently completed activity. Do not accidentally hide older active backlog by applying the activity date range to every headline count.
- Coordinate applicable crew, Party Chief, Instrument Man, Area, request-type and date filters across views. Show scope, units and date semantics. Preserve role restrictions on personnel metrics.
- Selecting a count, crew or request-type chart segment must open/filter the existing operational request views using the same server-side population predicate. Avoid a second request-management implementation inside the dashboard.
- Fetch aggregated visible dashboard data initially; retrieve bounded detail pages only on drill-down. Reuse the scoped aggregation and visualization framework already planned, including heat map, bar, trend, donut and gauge where useful.
- Adapt the reference's information hierarchy, complementary chart regions and management density to Axiom/SWRTracker. Do not copy branding, palette, exact layout, helpdesk terminology or irrelevant concepts. This is not a BI report builder.
- Explicitly mark unsupported metrics as deferred and explain their missing source data. No approximation presented as historical truth.

### Inspection and unresolved authority mapping

The project root currently renders `ProjectEntryRedirect`; it fetches project memberships and chooses a role's first navigation destination through `project-navigation.ts`. Survey Manager goes to Survey Operations; Superintendent goes to All Requests. The project header independently fetches the same project list. The current stat tile component and native pop-out remain reusable; the expanded chart framework has not yet been implemented.

Migration 022 stores project/Area `SURVEY_REVIEWER` and `FIELD_COORDINATOR` grants. The approved delegated-review implementation currently recognizes the Survey Manager's project role or explicitly granted Area Superintendents. Crew rosters link Party Chiefs to Instrument Men; they do not establish explicit Superintendent ownership of a crew. Ticket-level historical leadership snapshots are not current crew ownership.

Two questions have been put to the owner: whether to introduce explicit supervising-Superintendent crew assignments intersected with existing Area permissions, or use Area coverage alone; and whether authorized Area work not yet assigned to a crew belongs in a separate Needs assignment population. These materially change the authorized dataset. No crew ownership, scope expansion or exception for unassigned work is inferred pending the answer. Shared pagination and existing-scope aggregation work can continue independently.

### Additional completion gates

Owner clarification (Decision 11): Sabine follows Survey Manager → Survey Superintendent → Party Chief → Instrument Man. This confirms a real reporting chain rather than assuming Area overlap constitutes crew supervision. The dataset is incomplete evidence for individual reporting relationships. Preserve existing rosters and Area boundaries; retain missing Superintendent/Party Chief mappings explicitly. The clarification does not yet settle the separate unassigned-work population question or grant broader workflow permissions.

Owner clarification (Decision 12): a Superintendent dashboard may include a crew only through an explicit Manager-assigned Superintendent → Party Chief link **and** within the Superintendent's authorized Areas. Area overlap alone does not establish crew ownership. Individual Sabine links are still unprovided; do not synthesize them from imported requests. The unassigned-work population and the proposed staffing UI's conflict with the current CLAUDE.md §15 deferral remain pending owner decisions.

- [ ] Confirm the unassigned-work population and how to persist the now-confirmed explicit Superintendent → Party Chief link without overwriting the existing Area-delegated review decision.
- [ ] Establish server-derived landing capability; verify Survey Authorities receive the overview and other roles retain their current destinations.
- [ ] Build a coherent Axiom management overview from the shared charts/aggregates, with coordinated defaults and no initial detail-dataset download.
- [ ] Verify dashboard-to-request drill-down population equality, unauthorized crew/Area rejection, multi-crew/date combinations, mobile layout, and supported/deferred metric definitions.
- [ ] Include these additions in the final completion report and full-objective audit.

## Added owner requirement — Survey Team management

Provide a menu entry for the project's Main Survey Authority (Sabine Survey Manager) to establish Party Chief positions, assign individuals and Areas, and create or assign Instrument Man positions under a Party Chief. Reuse the fixed role types rather than a general role/permission builder. This complements the hierarchy-backed dashboard by making staffing relationships manageable and explicit.

Current inspection: the Survey Manager can read the project member list; member mutations are tenant-admin-only and Area mutations are project/tenant-admin-only. No existing crew-management menu was found. A dedicated authorized staffing workflow is required; a frontend-only menu or broad relaxation of the admin APIs is insufficient. Keep other project experiences and existing ticket workflow permissions intact.

- [ ] Clarify existing-person assignment versus manager-led invitation/account creation.
- [ ] Add the scoped Survey Team navigation and Party Chief/person/Area/Instrument Man management flow.
- [ ] Connect confirmed supervisory relationships to server-derived dashboard scope, preserving unresolved relationships explicitly.
- [ ] Test role escalation denial, tenant/project isolation, inactive people, conflicting assignments, replay/stale updates, atomic audit, and preservation of historical ticket responsibility.
- [ ] Verify the manager's complete staffing flow and responsive Axiom UI; document the supported onboarding boundary.

## Added owner requirement — top-right account navigation

- [x] Hamburger disclosure with Home, Profile, Assignment Details, Projects and Sign out.
- [x] Home retains the current project and uses its existing role landing. Project launcher retains existing authorization.
- [x] Read-only self profile and explicit Area/PC/IM assignment details; active session and project membership enforced server-side. Missing relationships remain explicit, not inferred.
- [x] Desktop/mobile Axiom styling, keyboard navigation, Escape focus return, outside-click dismissal, pending/error handling for sign-out.
- [ ] Survey Team management entry becomes available with the real authorized staffing flow above; do not add a nonfunctional link now.

Validation: TypeScript, 274 tests and production build pass. Final isolated browser confirmation passed destination navigation, four demo roles, unauthorized/malformed project IDs, keyboard handling, mobile overflow, and sign-out success/error, with zero page errors. Desktop/mobile captures preserve Axiom styling. The sign-out failure test found and verified a focus-loss correction. Preview updated at port 3106 without resetting project data.

## Sabine Historical — closeout review

Owner confirmed a read-only all-history dashboard with coordinated filters, chart drill-downs and compact searchable requests, leaving imported records and project lifecycle status unchanged. Owner selected code-first implementation within the existing Axiom UI. PRODUCT.md and the registered historical surface brief record these decisions.

Implemented in the existing All Requests surface: Overview/Requests views; status donut, Area/type bars, monthly distribution and completed-share meter; chart-to-list drill-downs; literal number/description/contact/requester search; Area/status/type/priority/Party Chief/population/date-basis/date-range filters; stable newest/oldest/Need-By ordering; 10/25/50/100 rows; native expandable rows; individually removable filters; refresh-preserved filter URLs; explicit empty/loading/error/retry states.

The new read-only review endpoint uses the Ticket repository's existing visibility predicate. A single SQL statement derives aggregates, authorized filter choices and the bounded page from the same authorized population, excluding drafts. Requesters, Instrument Men and configuration-only Project Admins cannot use this comparison endpoint; their existing workspaces remain. Historical memberships remain VIEWER. This shared All Requests enhancement is also available to its existing authorized live-project readers; Live Operations itself is unchanged.

### Data fidelity

Read-only baseline: 20,025 historical requests, 19,260 completed, 732 mapped cancellations, 33 open; 10 Areas and 39 chiefs with recorded historical ticket assignments. Need-By spans 2021-06-06 through 2024-05-22. The UI exposes 4,754 matching generated completion dates at the unfiltered baseline and labels anonymization, unsupported excluded categories, missing attachments/transition trails, simulated IM assignments and unknown cancellation path. No records were silently closed or reclassified. No turnaround/productivity claims were added.

### Verification and performance

- Baseline: TypeScript and 274 tests. Final: TypeScript, 278 tests and production build pass.
- HTTP: 120 checks across six accounts, including combined filters, totals, disjoint pages, malformed dates/IDs/limits, outside-project rejection and comparison with existing live ticket visibility. Historical VIEWER access is intentional for all demo accounts; live Requester/IM/admin-only comparisons return 403.
- Browser: desktop 1440px and mobile 390px; open/Area/month drill-downs, combined filters, filter-URL reload, pagination, disclosures, empty state, injected server error and retry passed; no page overflow or browser errors. Captures under `.impeccable/review/history-*.png`.
- Initial response contains dashboard aggregates/options plus 25 rows: 19,591 decoded bytes. Local sample: 159 ms all-history and 66 ms combined Area/status filter. These are local single samples, not production percentiles or field Core Web Vitals.
- Initial combined-filter plan incorrectly estimated 6,550 rows as one after materializing the authorized CTE, producing a slow provenance nested loop (12.3 s HTTP; 16.9 s EXPLAIN while other acceptance reads were running). Keeping the authorization CTE inline preserves base-table statistics: the same read-only EXPLAIN completed in 71 ms. No indexes, caches, migrations or new infrastructure needed.

Independent Impeccable finish review: Ship, no material findings, based on all five desktop/mobile captures and source accessibility inspection. Nonblocking copy observation: an empty filtered result uses the generic Project review heading; the project heading still identifies Sabine Historical.

Read-only documentation verification confirmed Axiom tokens, Roboto, controls and source-limit disclosures. Preserved incumbent DESIGN.md and sidecar. Surface-specific documentation gaps remain: Historical's summary/view/disclosure/chart patterns, 420px breakpoint and categorical #9b6010 are not yet represented in the foundation sidecar; chart bucket colors are categorical rather than semantic status colors. No design-system rewrite was authorized or performed.

Both handoff gates are complete for this addition. The broader Live authority-dashboard/chart-framework and Survey Team requirements remain separate unfinished work.

## Scoped operating metrics — Batch 31

The prior goal turn was progress: historical review implementation and verification completed. This continuation reread the full active objective and repository instructions; the goal remains active, not satisfied by the historical surface alone.

Extracted the existing Ticket visibility predicate into shared data-access glue (`lib/ticket-visibility-clause.ts`), preserving requester/company-authority, crew, Area/descendant, department and subcontractor behavior. Ticket detail/list/review and operating metrics now call the same predicate. Metrics use an explicit reader port; SQL lives in Reporting infrastructure instead of its application service. A single authorized CTE supplies summary and heat-map cells in one database snapshot; DRAFT is excluded. The application service rejects configuration-only Project Admin and mismatched project scopes. The route validates project IDs, resolves active identity and visibility server-side and disables response caching. Requester/IM now receive only ordinary scoped request measures, not personnel comparisons. Tenant Admin retains the established read-only project-health permission; no landing/workflow authority is added.

Validation: unchanged baseline TypeScript/278 tests/build; final TypeScript/282 tests/build. Read-only production-preview HTTP acceptance passed 70 assertions across six accounts; scoped counts matched ticket lists, client role/company spoofing did not expand results, unauthenticated/invalid/nonmember access was rejected. Historical 120-assertion regression also passed (20,025 snapshots, 33 open, 19,260 completed). Sabine admin holds TENANT_ADMIN as well as project configuration, so its read-only metrics correctly match the manager population; configuration-only denial is unit-tested, not claimed as a separate live-account HTTP proof. No records, memberships, lifecycle status or volumes changed. Preview web image replaced only.

Still required: reusable five-type KPI framework and pop-out controls; applicable filters and metric definitions/coverage; comprehensive real-PostgreSQL cross-tenant, company and department fixtures plus revoked-session tests for new analytics; authority-to-crew decisions; full final acceptance audit. The existing average first-submission-to-completion remains a legacy measure: synthetic historical dates and incomplete coverage must be explicitly handled before it is used as performance evidence. This batch does not claim those remaining requirements complete.

## PostgreSQL visibility proof — Batch 32

Previous goal turn classification: progress (shared scoped metrics shipped and tested). Current work adds the missing executable PostgreSQL fixture evidence before extending analytic inputs. `tests/beta/scoped-metrics-postgres.ts` passed 30 scenarios using session-local temporary tables and a final transaction rollback. No public data, grants or sessions were modified.

For each selected population the test independently asserts open/completed/approved-unassigned/overdue totals, average cycle hours and exact Area/status heat-map cells. It covers full readers, own-request scope, PC assignments, IM crew plus direct assignments (and missing roster), Area/descendant scope, missing Area/department scope, department/Area intersection, subcontractor company intersection, coordinator access, company-authority grant/revocation/inactive holder, wrong tenant/project, and configuration-only Project Admin denial. It also executes the same `getProjectRole`/active-session checks used by the metrics route: valid session, revoked version, deactivation, wrong tenant/project and removed membership. These are real PostgreSQL query/service tests, not a claim of HTTP middleware integration for every synthetic case. Existing six-account HTTP acceptance remains separate evidence.

Run explicitly with `SWR_METRICS_POSTGRES=1 node --import tsx tests/beta/scoped-metrics-postgres.ts` from the worktree with its private Sabine runtime configuration. The test sets its search path to pg_temp and explicitly qualifies fixture writes, preventing fallback writes to public tables. This closes existing-query fixture coverage, not coverage for filters/charts that have not yet been implemented.

Final gates: TypeScript, all 282 regular tests and production build passed after the final fixture change; `git diff --check` passed. No preview replacement was needed for this test-only batch. Full objective remains active.

## Authorized analytics filters — Batch 33

Previous goal turn classification: progress (30 real PostgreSQL authorization scenarios added). IMPLEMENTER, Reporting plus one claimed API route and its shared boundary parser. The existing metrics endpoint now accepts strict Area, request-type, status, Party Chief (`crewId`), Instrument Man, population (all/open/completed/assignment/overdue), date basis (Need-By/first submission/completion), and inclusive date ranges. Unknown/duplicate fields, invalid IDs/calendar dates, reversed ranges, and DRAFT analytics are rejected. No date filter is applied by default, so old active backlog is not silently hidden.

All filter clauses run after the existing authorized CTE; every headline and heat-map cell uses the same filtered population. Personnel filters are allowed for Survey Manager, Survey Superintendent and Party Chief only, and remain intersected with existing ticket visibility. Requester and IM requests reject personnel filters at the application boundary, even if manually sent over HTTP. Read-only/admin roles do not gain personnel-analysis permissions merely from broad ticket visibility. Broader management/CTS personnel permission remains a policy clarification, not an inferred grant. API metadata reports validated filters, personnel-filter capability and UTC date semantics; no UI control has yet been added in this batch.

Baseline: TypeScript/282 tests/build. Final: TypeScript/285 tests/build, 39 real PostgreSQL scenarios and 113 six-account HTTP checks passed. Added fixture cases prove filters cannot reach another crew or Area; combined personnel/status/Area filters reconcile; completed, assignment, overdue and inclusive date selections use matching heat-map/summary populations. SQL parameters remain bound. Sabine records, memberships and lifecycle unchanged; only verified local web image replaced.

Still required: shared chart-series/facet results, source-quality-aware turnaround/coverage, reusable five-type chart renderers and pop-out controls, authorized drill-down equality for the new filters, comprehensive browser/performance acceptance, and the separate authority staffing decisions. Existing historical review remains intact; this is not full-objective completion.

## Shared chart aggregates and coverage — Batch 34

Previous goal turn: progress (validated narrowing filters shipped). IMPLEMENTER, Reporting plus the same one metrics route. `view=charts` now returns one typed aggregate contract for Area/type/status, authorized crew/IM groups, Area/status cells, zero-filled monthly trends, and authorized filter choices. Default refresh responses omit chart groups/facets. Series expose count, mean cycle hours and eligible sample count; summary total supplies a visible population denominator for the forthcoming operational gauge. All groups use the same authorized/filtered query. Requester, IM and read-only/admin responses contain no personnel groups or personnel facet values; the server does not join user labels for those chart responses.

Groups/facets are capped at 200 and trends at the latest 120 calendar months, with explicit truncation metadata. Full summary totals are not clipped. Empty intervening months are zero-filled; missing timestamp coverage is reported rather than assigned a fabricated month. Turnaround now excludes generated completion dates, missing first-submission/completion dates, and negative chronology. Counts of imported records, synthetic completions, eligible cycle samples, missing/invalid cycle dates and undated records accompany the response. Imported recorded dates remain usable but provenance is disclosed; this is not a reconstructed workflow trail or employee productivity score.

Validation: 46 real PostgreSQL fixture scenarios including bounded >200-group/>120-month responses, exact group/cell sums, zero-filled months, personnel omission and generated/missing/negative completion dates. TypeScript and 286 regular tests pass. Production-preview HTTP acceptance: 144 checks across six accounts. Historical chart response: 12,117 decoded bytes, 94 ms local single sample; 20,025 aggregate records and 14,506 cycle samples after excluding 4,754 synthetic completions. These are local samples, not production percentiles. Existing Sabine data and volumes preserved; verified web image updated.

Still unfinished: five reusable chart renderers and pop-out controls consuming this contract, coverage/scope labels in those controls, new-filter detail drill-down equality, full browser/performance acceptance and authority/staffing policy questions. No full-goal completion claim.

## Interactive scoped explorer — Batch 35

The Survey Operations queue-health tiles now open a lazy-loaded explorer with a shared renderer registry for heat map, bar, monthly trend, donut and population-share gauge. Chart changes reuse the same bounded aggregate response. Controls expose KPI, visualization, applicable groupings and a collapsed filter/date panel. Labels describe the authorized population, units, date basis and active selections; coverage explains imported snapshots and excluded turnaround dates. Personnel grouping/filter controls follow server capability metadata. Turnaround uses count/sample-aware heat, bar and trend only; the gauge explicitly measures selected-population share, not employee productivity or an invented SLA target.

Clicking a category or a heat cell narrows the same filters and fetches a bounded detail page. Monthly values can narrow the date range. Rows are selectable at 10/25/50/100. Ticket query filters now support the same inclusive date bounds and current crew/Instrument Man assignments; existing visibility remains the outer boundary. The denominator query removes only the selected population restriction and preserves other filters.

Validation: TypeScript, 287 tests and production build; 47 isolated PostgreSQL scenarios; 170 HTTP checks including detail/aggregate count equality; browser interaction acceptance covering deferred fetch, no chart-switch refetch, drill-down, page size, cycle choices, empty/error retry, Escape/focus restoration, desktop/mobile and zero JS errors. Six settled captures cover all five chart types. A single detector pass had no primary findings; incumbent-style type sizes/control border produced five advisories, supplied to independent review. Final review outcome will be appended below. Historical data and project lifecycle are unchanged; only the preview web container was replaced.

Remaining work is explicit: the full objective is not complete. Requester and field landing-page integration, authority/staffing policy decisions and comprehensive final acceptance still need work. This batch adds no personnel authority or fabricated completion attribution.

Finish outcome: the independent reviewer found one material issue, repeated donut category colors. A single correction groups more than six categories into the top five plus explicitly labeled Other, with expandable exact remainder categories and their original drill-downs. Seven recaptures were validated; the reviewer scored the fix resolved and returned ship at that fix-list scope. Final TypeScript/287 tests/build and browser checks passed. The documenter compared this local extension against the incumbent and preserved DESIGN.md and .impeccable/design.json without drift repair.

## Role-specific KPI entry — Batch 38

Previous goal turn: progress; the requested phase5 checkpoint was reconciled and pushed, but the full KPI and staffing objective remains active. The Requester My Requests and field Crew Work routes now offer a compact, on-demand chart explorer. It fetches the server-scoped aggregate only after opening, unmounts it when closed, and leaves the existing page queues in place. Requester defaults to request status donut and omits assignment/overdue KPI choices; field defaults to the open-request Area heat map and omits assignment. The existing Reporting endpoint remains the authorization boundary: Requester and Instrument Man responses omit personnel facets and reject manually supplied personnel filters. A Party Chief using Crew Work retains only the server-authorized personnel controls. No role authority, ticket state, imported record or project lifecycle changed.

The explorer's heat-map, detail-list and page-size styles are now self-contained for routes other than Survey Operations. Mobile Requester controls place visualization and grouping side by side so the chart is visible in the first dialog viewport. The dialog has Close/Escape handling, labels, loading/error/empty states and bounded detail pagination inherited from the shared explorer.

Verification: final TypeScript and production build pass. Native Windows test result is 286/287 with only the pre-existing Unix file-mode assertion in `tests/attachment/local-storage.test.ts`; the earlier Linux image gate for the prior checkpoint passed 287/287, but Docker/WSL were unavailable for a fresh Linux run in this batch. A local mocked-browser acceptance check at 1440px/390px for Requester and Instrument Man verified zero analytics requests before opening, one on open, restricted choices, successful render and Escape close, no horizontal overflow and zero page errors. The mock proves UI behavior, not live API authorization; Reporting PostgreSQL/HTTP authorization evidence remains in Batches 32–35. No endpoint or database changes were made in Batch 38.

Still open: full-objective completion audit, real-data review of both new landing routes when the Sabine preview is available, and the separately scoped Survey Manager staffing policy/flow. The current branch checkpoint is a development save, not a release claim.

Independent Impeccable finish review inspected the component diff and four final desktop/mobile captures and returned Ship with no material UI blocker. The review explicitly does not establish live backend authorization or data accuracy because the browser captures used mocked responses.

Independent read-only design documentation check found the extension aligned with Axiom and no new token or identity need. Its narrow traceability gap was closed in PRODUCT.md, DESIGN.md and KPI_EXPLORER_BRIEF.md; the incumbent sidecar was left unchanged.

## Bounded personal and field queues — Batch 39

After the role-specific chart checkpoint, the Requester My Requests page was still retrieving a 20-row page that included drafts and then hiding drafts in the browser. This could produce an empty or short visible page even when later submitted requests existed, while the total/pages counted drafts. It now asks the existing Ticket API for `queue=all`, which excludes drafts in both its count and page query after the same authorization predicate.

Crew Work previously fetched only the first 50 authorized tickets, then selected ASSIGNED, IN_PROGRESS and DELAYED in the browser. Party Chief Approvals did the same for PENDING_FIELD_VALIDATION and PENDING_PC_APPROVAL. An actionable ticket beyond either first page could disappear. The Ticket API now accepts narrow `fieldWork` and `pcApprovals` queues that bind their respective statuses as parameterized predicates after tenant/project/role/company scoping. Both pages use the existing stale-response-safe page hook, 25-row default, 10/25/50/100 row sizes, server totals, page controls, retry/refresh and a clamp when an action empties the last page. They no longer download unrelated ticket states to construct their queues. This changes no role grant or workflow transition; any caller of a queue receives only requests already authorized by the repository predicate.

Validation: focused Ticket query tests pass 7/7, including count/page scope intersection and bound statuses for both queues; final TypeScript and production build pass. Native Windows suite improves from 286/287 to 287/288, with only the previously documented Unix attachment-mode assertion failing. Mocked mobile browser checks observed `fieldWork` and `pcApprovals` with 25/50-row page offsets, `all` on Requester, no horizontal overflow or page errors. This is a UI/request-shape check, not a real-database load benchmark. The prior SQL/HTTP role-scope evidence is unchanged; a fresh Linux test gate and live Sabine review await an available container runtime.

Independent Impeccable finish review returned Ship with no material UI blocker for the three role queues. It confirmed the labeled page-size controls and visible loading/error states; the verdict does not establish live API/data correctness.

## Draft count/page alignment — Batch 40

The separate Drafts page had the inverse pagination error to My Requests: it fetched and counted every status, then discarded non-drafts in the browser. It now uses the Ticket API's existing `status=DRAFT` filter so the visible page and total have the same server-side population and authorization. No new endpoint, status, role permission or draft lifecycle behavior was added.

Final TypeScript and production build pass. The targeted parser/filter test confirms a bound DRAFT predicate; native Windows tests are 288/289 with only the same documented Unix attachment-mode mismatch. A mocked 390px browser check verified the Drafts request shape and no page overflow or JavaScript errors. This does not substitute for a live Sabine data review or a fresh Linux gate.

## Superintendent personnel-scope guard — Batch 42

Decision 12 requires an explicit Manager-assigned Superintendent → Party Chief relationship intersected with authorized Areas. The existing analytics implementation still treated an Area-scoped Superintendent as able to compare Party Chiefs and Instrument Men within that Area, even though no explicit reporting-link table or assignments exist. That would infer crew ownership from Area overlap. Until the confirmed relationship is represented and validated server-side, Superintendent metrics now remain Area-scoped for ordinary request counts but reject `crewId` and `instrumentManId` filters and omit personnel groups/facets from chart responses. Survey Manager and Party Chief personnel analysis remains under their existing respective project/crew scopes. The route capability flag uses the same policy function, so the UI does not offer controls that the server rejects.

Focused Reporting tests pass 9/9, including no-query rejection and SQL omission for Superintendent personnel dimensions. The opt-in PostgreSQL fixture now asserts the rejection and empty chart personnel arrays, but could not be rerun while Docker/WSL were unavailable. TypeScript and production build pass; native Windows suite remains 288/289, with only the previously documented Unix attachment-mode failure. This is a deliberate fail-closed interim policy, not a substitute for implementing the explicit reporting relationship and its full authorization tests.
