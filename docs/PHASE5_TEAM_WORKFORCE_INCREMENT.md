# Phase 5: assigned workforce, project creation and shared controls

Approved and verified 2026-10-01 on `phase5`, starting at `79bf563`. This increment implements the owner's pasted Team Management / Project Creation / UI Refinement request and subsequent design approval. It does not close the overall Phase 5 or hosted-beta gate.

## Behavior and authority

| Actor | Team Management and KPI population | Changes permitted here |
|---|---|---|
| TENANT_ADMIN / IT Admin | Launcher has Create Project, existing templates and the newest 100 tenant projects, including Setup projects | Existing project creation contract only: name, crew build or template; success stays SETUP and links to existing configuration |
| Survey Manager | Existing project-wide Personnel/Teams/staffing UI retained; current survey personnel have member KPI entry | Existing Manager commands retained |
| Survey Superintendent | Current explicit Superintendent-to-Party-Chief reporting links intersected with current active Area coverage, plus Instrument Men on those Chiefs' current rosters | Transfer an already assigned Instrument Man between already assigned Chiefs; cannot expand that pool |
| Party Chief | Instrument Men currently on that Chief's active roster | Read-only inspection and scoped member KPIs |
| Other roles | No new Team Management menu entry, data or member analytics | No new authority |

The existing model safely represents the Superintendent's pool: a Manager assigns explicit reporting/crew links; current links, fixed roles, active identities, project memberships and Area grants remain authoritative. Shared Area coverage, historic ticket assignments and organizational team membership never create workforce ownership. Transfers preserve the pool and request history; they do not change roles, Area grants, Chief reporting links, organizational teams or historic request assignments.

Commands lock the project and affected memberships, validate current actor/session and both subjects, compare the server-issued staffing snapshot, require a stable idempotency key, and append a staffing audit event in the same transaction. Current pool authorization also precedes replay. Archived projects deny mutations; stale state requires deliberate reload. Resource scope/foreign personnel denials retain 404, role access denials retain 403.

Member drilldowns reuse the KPI explorer, reader, definitions, provenance and cycle rules. Mandatory person focus applies to the authorized CTE before totals, facets and denominators. Superintendent member views use linked crews, not Area-wide workload; Chief/IM focus also preserves the current Chief link for field viewers. A Manager inspecting a Superintendent uses that Superintendent's current linked-crew/Area population. Broader personnel selectors/facets and matching-request expansion are suppressed in member views; ordinary authorized explorers remain available.

The account menu obtains current project-role context from the account API. Team Management independently resolves server authority and returns the Manager UI or assigned-workforce UI. Search/results and Chief choices are bounded and paginated.

Shared controls use straight button corners, including menu buttons, navigation buttons and body-portaled arrows. Inputs, banners, badges, cards and dialog rounding are retained. Back to top discovers meaningful page/container overflow, targets the applicable scroller, works by keyboard, respects reduced motion, and portals dialog arrows into the native top layer. Popouts reserve a 60px footer while an arrow is useful; their frozen Close header remains unchanged. Nested dialogs are supported.

## Verification

Clean baseline: TypeScript, 388 tests and application build passed before changes.

Final production Docker build runs nonincremental TypeScript verification, all **397 tests (0 failed)** and Next.js production build on the incumbent Node 22 image. Native TypeScript and the same 397-test suite also passed. No dependency, schema migration, project role or separate metrics/creation backend was introduced.

| PostgreSQL harness | Passed |
|---|---:|
| survey-teams-postgres.ts | 63 |
| superintendent-kpi-postgres.ts | 20 |
| survey-staffing-safety-postgres.ts | 42 |
| survey-staffing-unlink-postgres.ts | 35 |
| team-workforce-postgres.ts (new, actual routes/repositories) | 74 |
| assessment-authorization-postgres.ts | 53 |
| scoped-metrics-postgres.ts | 55 |
| draft-recovery-postgres.ts | 78 |
| **Total** | **420** |

New unit coverage: tenant-admin creation and non-admin API denial; assigned-pool transfers/audits; outside-pool actors/subjects; Chief read-only authority; stale snapshot/session/archive denials; mandatory KPI focus/filter conflicts; role-aware navigation. The PostgreSQL matrix adds overlapping-Area/non-owning Superintendent checks, current roster authorization, forged IDs/filters, foreign tenant/project IDs, idempotent replay after loss of authority, role/session/deactivation/Area revocation, archived project behavior, template scope, revoked IT-admin authority and an explicitly mixed organizational team that grants no extra visibility.

The new browser harness passes **96 checks at 1440×650 and 390×650**, using real authenticated Manager, Superintendent, Chief, IT Admin, Requester and IM sessions against the production image and a disposable database. It verifies menu/direct-URL authority, preserved Manager tabs, Chief read-only view, SP move success and restricted picker, KPI views/layout, creation/configuration/SETUP state, page/contained/nested-modal arrows, keyboard activation, focus return, frozen Close position, reserved arrow space, square controls and retained input/panel rounding. Selected final screenshots were visually inspected. Production Secure-cookie policy is unchanged; the loopback HTTP test context transports the real login token explicitly.

A separate read-only reviewer found nested-dialog exclusion and rounded portal/navigation controls. Both were fixed, with browser regressions; follow-up found no remaining actionable implementation blocker.

Existing build warnings remain in untouched operations/project-review CSS (autoprefixer `end` support and cache serialization). The native browser harness emits an incumbent Node URL deprecation warning. These did not fail verification. The design detector ran once; its inherited style advisories did not authorize a wider visual redesign.

## Files changed

- .dockerignore
- .gitignore
- DESIGN.md
- PRODUCT.md
- docs/CODEX.md
- src/app/(projects)/projects/[projectId]/(survey)/survey/teams/page.tsx
- src/app/(projects)/projects/page.tsx
- src/app/api/projects/[projectId]/metrics/route.ts
- src/app/api/projects/[projectId]/survey/workforce/route.ts
- src/app/api/projects/administration/route.ts
- src/app/api/projects/post-handler.ts
- src/app/api/projects/route.ts
- src/app/globals.css
- src/components/ui/account-menu.css
- src/components/ui/account-menu.tsx
- src/components/ui/account-navigation.ts
- src/components/ui/assigned-workforce.tsx
- src/components/ui/button.tsx
- src/components/ui/kpi-explorer.tsx
- src/components/ui/member-kpi-entry.tsx
- src/components/ui/project-creation.tsx
- src/components/ui/scroll-to-top.tsx
- src/components/ui/team-management-entry.tsx
- src/components/ui/team-management.tsx
- src/lib/apiClient.ts
- src/lib/project-insight-auth.ts
- src/modules/reporting/application/amelia-metrics.ts
- src/modules/reporting/application/member-metrics.ts
- src/modules/reporting/infrastructure/amelia-metrics.reader.ts
- src/modules/tenancy/application/survey-workforce.ts
- src/modules/tenancy/infrastructure/survey-workforce.repository.ts
- tests/beta/team-workforce-browser.mjs
- tests/beta/team-workforce-postgres.ts
- tests/reporting/member-metrics.test.ts
- tests/tenancy/project-create-route.test.ts
- tests/tenancy/survey-workforce.test.ts
- tests/ui/team-account-navigation.test.ts
- docs/PHASE5_TEAM_WORKFORCE_INCREMENT.md

## Reproduction and limits

Use a fresh disposable PostgreSQL15 database swr_team_isolated on 127.0.0.1:15489, apply existing migrations001–029, and set DATABASE_URL, JWT_SECRET and SWR_TEAM_POSTGRES=1. Run tests/beta/team-workforce-postgres.ts with node --import tsx before browser acceptance (it requires fresh fixture IDs). Existing team/SP/staffing harnesses run sequentially with their documented flags. Build with docker build -t swrtracker-phase5-increment .; expose only the owned synthetic image at127.0.0.1:3107 using the same test JWT and database. Set SWR_PLAYWRIGHT_MODULE to an installed Playwright index.mjs and optionally SWR_BROWSER_EXECUTABLE, then run node tests/beta/team-workforce-browser.mjs. Guards reject non-owned URLs/databases. Acceptance logs/captures go to ignored .local. The existing security/metrics/draft regression scripts retain their own fixed rollback-only fixture guards.

No unresolved implementation blocker was found for this approved increment. General Superintendent organizational-team CRUD, independent unrostered IM pool assignment, IT invitation/account lifecycle, individual Sabine population mapping, CSV/export analytics and the broader Phase5/hosted-beta gates remain outside this increment. The existing model intentionally requires a Chief roster for SP/PC IM visibility; unassigned IMs remain Manager-visible only. Field viewers do not inherit historic IM work outside their current Chief/population. New member matching-request expansion is deferred until its request-list population can exactly match mandatory member focus.

The final owned synthetic web/PG containers are stopped after verification. Existing Sabine containers, real request/staffing/files and original dirty checkout remain untouched. No push, merge or deployment was requested.
