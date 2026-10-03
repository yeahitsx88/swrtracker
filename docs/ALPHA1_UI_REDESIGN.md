# Alpha 1 authenticated workspace redesign

The owner-provided dashboard screenshot defines layout, hierarchy and navigation. Current Axiom/SWRTracker identity, Roboto, semantic appearance tokens and Alpha 1 permissions remain authoritative. No SurveyRelay branding or new backend capability is introduced.

## Workspace

The existing authenticated account header and right account overlay remain. Project pages share a persistent 224px desktop sidebar, current project/role/state context and content workspace. Below 1000px, Project navigation opens a native modal drawer with a fixed title/Close header, scrollable destinations, Escape/backdrop dismissal and focus restoration. Account navigation remains separate. Navigation groups Home, Work, People, Administration and Account. Existing direct routes remain.

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

Home reuses Card, StatusBadge, Icon, AdministrationRecords, KpiChart and existing KPI explorers. The record primitive gains an optional compact tools disclosure; ordinary tables retain their existing controls. Requester/Crew Work URLs accept validated Home filters with explicit clearing; server scope still applies. Draft links use the existing `draft` resume parameter. Light, Dark, System and derived tenant actions remain supplied by the established appearance system.

Verification evidence and remaining work are appended in docs/CODEX.md. Retained customer databases, runtime volumes and original branches are never reset; acceptance uses a newly owned disposable PostgreSQL instance/schema and loopback runtime.
