# Alpha 1 authenticated workspace redesign

The owner-provided dashboard screenshot defines layout, hierarchy and navigation. Current Axiom/SWRTracker identity, Roboto, semantic appearance tokens and Alpha 1 permissions remain authoritative. No SurveyRelay branding or new backend capability is introduced.

## Workspace

The authenticated Axiom account header and greeting remain. Project pages share a persistent 224px desktop sidebar, current project/role/state context and content workspace. Below 1000px, Project navigation opens a native modal drawer with a fixed title/Close header, scrollable destinations, Escape/backdrop dismissal and focus restoration. Navigation groups Home, Work, People, Administration and Account. Appearance, Profile, Assignment Details, Switch project and Sign out are consolidated in the left navigation; project pages omit the redundant top-right Menu. Pages without a project sidebar retain their existing account menu. Profile and Assignment Details keep the current project query context. Existing direct routes remain.

Navigation uses the current capabilities API together with membership and authorized administration inventories. Independent administration is additive; disabled/revoked operational access supplies no operational destinations. Setup and archived states omit New Request. Current destination APIs continue to enforce authorization and lifecycle state; links never confer authority.

## Home

Operational project landing is `/projects/:projectId/home`. Setup administration and scalar Project Admin landing retain `/admin`. Archived operational memberships open history-oriented Home. Missing listed membership still cannot obtain operational access.

- Requester: prominent New Request on active projects, scoped open/review/upcoming/completed counts, recent requests, status distribution, upcoming dates and resumable drafts. Counts may include company requests already granted to the account; do not describe them as exclusively personal.
- Survey Manager: authorized current-state counts, recent/upcoming requests, queue health, Area distribution and crew request distribution. Existing Operations and Team Management remain directly accessible.
- Superintendent: Area-wide current workload and requests; a separately opened, fixed linked-crew KPI explorer uses explicit current links intersected with authorized Areas. Area overlap grants no reporting relationship.
- Party Chief: scoped current work/history, pending field reports and Crew Work/approval destinations. Instrument Man: simpler current/upcoming work and links to existing field controls. Successful completion and field inability retain their current workflows.
- Administrative capability: an independent administration entry accompanies operational Home, or an administration-only workspace when no operational membership exists. Preparation Home advertises no ordinary work.

All-date current-state totals come from existing scoped aggregates/list totals. Upcoming means today through three days ahead using UTC Need-By dates and open requests. Completed is all dates, not a screenshot-inspired 30-day measure. Recent/draft panels load at most five/three rows; count summaries never derive from those rows. Chart slices/Area/crew panels expose their limits. No assignment timing, capacity target or productivity is inferred.

Existing insight resolution gives independent administration precedence for non-Manager accounts. Those combined accounts therefore compose status counts from bounded authorized list reads and do not call forbidden analytics or advertise Operations analytics. This preserves server authority rather than changing it for presentation. The existing analytics entry points outside Home retain their prior server behavior.

## Shared controls and verification

Home reuses Card, StatusBadge, Icon, AdministrationRecords, KpiChart and existing KPI explorers. The record primitive gains an optional compact tools disclosure and overflow hint at any width; ordinary tables retain their existing controls. Desktop compact tables keep reference/date values intact and status text inside its cell. Requester/Crew Work URLs accept validated Home filters with explicit clearing; server scope still applies. Draft links use the existing `draft` resume parameter. Light, Dark, System and derived tenant actions remain supplied by the established appearance system. Selected navigation and Home planned badges use semantic primary text over their existing selected/planned surfaces for readable contrast. The shared AccountSignOut preserves the existing logout API and failure/retry behavior.

Verification evidence and remaining work are appended in docs/CODEX.md. Retained customer databases, runtime volumes and original branches are never reset; acceptance uses a newly owned disposable PostgreSQL instance/schema and loopback runtime.

## Final verification and handoff

The implementation is checkpointed on `alpha1-ui-redesign`: `285b6ce` records the verified shell/Home and `dc77039` records account consolidation. The source/migration digest for final acceptance is `c39437b039b49a24ae35bd2c4febbdb2ab259fa1fbd52df5fd0ac2c6b6335011`. Sanitized results are retained in [acceptance evidence](../audits/alpha1-ui-redesign/evidence.json); generated logs, synthetic manifests and captures remain ignored locally.

| Requirement | Current evidence |
| --- | --- |
| Safe branch from latest Alpha 1, preserved hardening branch | Branch base b8ff814; hardening local/remote SHA unchanged; redesign-only commits |
| Applicable authority and baseline | docs/AGENTS/README/CODEX, approved requirements/decisions, incumbent PRODUCT/DESIGN/CLAUDE and audit inspected; baseline strict types,559 tests,pinned build recorded |
| Shared sidebar/dashboard composition | ProjectShellHeader/ProjectNav/ProjectHome plus shared primitives; desktop1440 and mobile390 captures for nine authority combinations |
| Requester scope and useful intake/status/draft/date Home | Real requester list/metrics reads, ownership assertions, matching completed drill-down and successful draft resume in production browser |
| Manager work/Area/crew/queue Home | Production Manager capture and scoped APIs; Area/crew distributions are request counts with limits and explicit wording |
| Superintendent Area versus explicit linked crews | Area-only and narrower linked-cohort HTTP assertions; separate fixed-cohort explorer; no overlap-based reporting |
| Chief versus Instrument Man obligations | Role captures/navigation assertions; Chief approvals queue and existing field destinations; no Instrument Man approvals link |
| Independent Project Admin coexistence | Admin-only plus Manager/Requester/Superintendent combinations rendered and verified; forbidden combined analytics remain403 |
| Actual server authorization and lifecycle retained |27 PostgreSQL suites,52 production HTTP checks and55/55 named cases; direct wrong-role/foreign-project/disabled reads denied; setup/archived context and creation restrictions checked |
| Existing routes and workflow/retry |24 lifecycle browser checks plus26 lost-response checks; actual Profile context, request filtering, draft resume and logout failure/retry exercised |
| Axiom identity and appearance | Existing artwork/Roboto retained; no SurveyRelay text; Light/Dark/System,834px device preference and approved tenant color API/readback checked |
| Intentional responsive/accessibility behavior | No page overflow at1440/390/834; native modal Escape/focus restoration;46px navigation; readable selected/planned states; actual contrast/date/reference/gutter assertions; existing semantic tables and reduced-motion architecture retained |
| Shared components, no unsupported backend | Existing Card/StatusBadge/AdministrationRecords/KpiChart/explorers/account helper reused; new presentation Home/data adapter/filter helper/icon/logout component; no domain/API/schema changes |
| Automated regression |566/566 unit/route tests, strict/unused TypeScript, pinned Node22.23.3 production build and dependency-stage production audit pass |
| New browser acceptance |688 checks across36 role/theme/viewport combinations, plus System/tablet, tenant customization, setup and account navigation captures |
| Design basis and checkpoints | DESIGN.md, token-bearing .impeccable/design.json and surface brief updated; CODEX batches128 onward record checkpoints/results |
| Independent finish handoffs | Initial material findings corrected and scored resolved; fresh review opened all43 valid final captures and returned ship for captured shell/Home/account navigation; documenter updated design and token sidecar |

Existing Alpha 1 risks and open decisions remain tracked in [the baseline report](../audits/alpha1/REPORT.md). Non-Manager accounts with administrative capability retain the existing analytics precedence limitation; Home uses bounded authorized status-count reads and omits unavailable analytics. Combined accounts may issue thirteen small status-count requests in addition to ordinary Home reads, an explicit composition tradeoff with the current API. No new reporting authority is inferred.

SurveyRelay branding, new permissions/analytics, custom dashboards/builders, speculative workflows and unrelated refactoring remain deferred. Remote CI, deployment and operational beta approval are separate from this local UI acceptance. Retained customer data and runtimes were preserved.
