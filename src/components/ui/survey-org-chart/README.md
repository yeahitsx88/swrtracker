# Survey organization chart

Accepted fixture V1 reference: `dda015ed3ddc2fe85d1c52c95e3b1a668dcbe1a3` on preserved `codex/survey-team-org-poc`. Alpha integrated that feature at `988988a`; the read-only hierarchy increment starts from `fd30b8c`.

## Historical read-only checkpoint contract

TeamManagementEntry supplies its current project ID only after its existing workforce context resolves to SURVEY_MANAGER. The launcher is still disabled while an operational editor/command owns the workspace. The large native dialog retains its fixed Close header, independent body scrolling, Escape behavior and focus restoration.

`LiveSurveyOrgChart` loads `GET /api/projects/[projectId]/survey/organization` on demand. It has loading, empty, failure/retry and access-denied states, retires stale responses, and clears displayed data before reload. Failed reads never fall back to fictional personnel. Reload and reopening obtain fresh authorized data. No polling or persistence is added.

The route reuses active-session and current project-role checks. It permits only current Survey Managers and returns private, noncached responses. The Tenancy application adapter reuses existing Manager-authorized team/personnel, Chief staffing and Superintendent Area reads in one READ ONLY / REPEATABLE READ transaction. Normal request diagnostics remain the established route wrapper behavior; organization reads create no staffing, ticket or administrative events. POST/PATCH/PUT/DELETE are unsupported.

Reporting, crew rosters, named-team memberships/leadership, team Areas, reporting-link Areas, Chief assigned Areas and Superintendent individual Area evidence stay distinct. Connectors represent only explicit current Superintendent-to-Chief and Chief-to-Instrument-Man links. The project does not store Manager-to-Superintendent reporting links, so Survey Managers form a labeled leadership grouping without an invented connector. Named teams remain independently inspectable; membership or overlapping Areas never imply a parent.

Inactive/changed-role links returned by existing Chief staffing reads remain labeled evidence, rather than being recast as active Survey roles. Chiefs without an eligible Superintendent are shown with their crew in a separate reporting section. Instrument Men without a displayed eligible Chief appear separately; the chart expressly does not claim they are available for reassignment. Existing reads select active eligible Chiefs, so links whose Chief is outside that population are not expanded. Superintendent shared-department Area evidence is available from the existing read as a count only; the chart identifies that limit rather than inferring individual coverage or department nodes. Chief Area evidence retains the existing aggregated assignment semantics, not a replacement permission-grant inventory. Supporting headcount without app accounts is not invented.

The adapter reads pages of100 with explicit display ceilings:500 current survey personnel,200 named teams,500 crew links per Chief,500 individual Area assignments per Superintendent, and the existing100-Area Chief detail ceiling. Exceeding a ceiling returns a clear error directing the user to existing Team Management evidence. No silently truncated hierarchy is presented. This bounded initial view is not a large-project performance certification.

The live view preserves the V1 fixed viewport, pinned unscaled50–150% zoom, collapse controls and contained scrolling. Move grips, Move/Move Crew actions, move reviews, Confirm and Reset Demo are absent. Event guards also refuse fixture move proposals in read-only mode. No API writes, live local move projections, staffing edits, hierarchy edits or ticket/history changes are enabled.

## Production model and historical reproduction

The launcher requires a project ID and the workspace requires current authorized
organization data. Production imports `model.ts` for chart types and client move
rules; the backend remains authoritative. Synthetic personnel and fixture-only
projection live in `tests/ui/fixtures/survey-org-chart.ts`. No prototype route,
no-project launcher or local demo mutation control is shipped.

The accepted prototype can be reproduced at the immutable V1 commit
`dda015ed3ddc2fe85d1c52c95e3b1a668dcbe1a3` in an isolated checkout using its original
`tests/ui/survey-team-prototype-browser.mjs` and documented loopback prerequisites.
The entry harness at `45af79a` is historical evidence only. Current acceptance is
`tests/beta/reconciliation-browser.mjs`, using actual Team Management and newly
owned project fixtures, including governed review, cancel, commit and exact retry.
Historical receipts remain source-bound and unchanged.

## Historical read-only verification

`tests/tenancy/survey-organization.test.ts` covers semantic distinctions, no inferred edges, retained links, bounded complete pagination, Manager-only access, current-session revalidation and the read-only snapshot contract.

`tests/beta/survey-organization-read-only.ts` and `tests/ui/survey-organization-live-browser.mjs` are opt-in (`SWR_ORG_READ_ACCEPTANCE=1`) and require a **newly owned**, empty PostgreSQL15 database named `swr_org_read_20261006` on loopback15496, plus its production runtime on3171. This task-specific guard is not permission to reuse any retained database. Setup refuses existing public tables, applies current migrations and writes a private ignored fixture manifest. Supply its generated DATABASE_URL/JWT_SECRET through a private env file, and the existing Playwright module through SWR_PLAYWRIGHT_MODULE. Run the TypeScript helper with `setup` once, `verify` against the matching production runtime, then the browser helper. Setup is not a reset command. The executor removes only the newly owned runtime/database/volume/network after verification.

Live evidence covers actual current PostgreSQL/HTTP/browser authorization and tenant/project isolation, multi-page personnel, reporting versus named-team leadership and multiple Areas, a separate-connection concurrent team update with a coherent aggregate snapshot, refused write methods, revoked access, archived/MEDIUM/SLIM views, no unintended writes, retained domain-table hashes, existing staffing/team/Area/KPI controls and desktop/mobile layout. Supporting shared-department detail, unavailable former-Chief relationships and non-account headcount remain explicitly outside the expanded view. Full touch dragging is inapplicable to live read-only mode; other browser engines and large-project performance are unverified.

Strict types, all normal units, focused suites and pinned Node22.23.3 production compilation are recorded in docs/CODEX.md. That checkpoint inherited the source-map-js/GHSA-68fv-2mgg-jv7q blocker; current reconciliation has a separate patched dependency/image receipt. No deployment or production staffing-mutation approval is implied.

## Current operational contract

The real Team Management entry supplies project context. Current Managers and
scoped Superintendents use the existing governed visual reviews; Archived charts
remain read-only. Current hierarchy reads, explicit reporting/Area/team facts,
backend authority, retry keys, stale snapshots and atomic evidence retain their
established contracts. No synthetic personnel fallback or local demo save ships.
Reconciliation receipts cover actual review/cancel/commit, exact retry after a
lost reply, stale-review refusal, focus return and current read-only states.
