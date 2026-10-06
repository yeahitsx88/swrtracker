# Survey Team Management org-chart POC

Exploratory UI only, based on `alpha1-ui-redesign` commit `3cd03cf`. No org-chart redesign is approved. Accepted V1 checkpoint: `dda015ed3ddc2fe85d1c52c95e3b1a668dcbe1a3`, pushed to `origin/codex/survey-team-org-poc`. The implementation is isolated on `codex/survey-team-org-poc`.

## Open and compare

Run `pnpm dev --hostname 127.0.0.1 --port 3161`, then open `http://127.0.0.1:3161/prototypes/survey-team` in a browser with an existing SWRTracker session on that host. The unchanged middleware applies its existing sign-in gate. The prototype sits outside the operational application layout, uses no database and calls no APIs. It returns 404 outside development.

For a standalone fixture preview without configuring a database, use the included browser helper with an existing Playwright installation:

```powershell
$env:SWR_POC_ORIGIN = 'http://127.0.0.1:3161'
$env:SWR_PLAYWRIGHT_MODULE = 'C:\path\to\playwright\index.mjs'
node tests/ui/survey-team-prototype-browser.mjs --preview
```

The helper opens an isolated Edge window with a clearly synthetic cookie satisfying only the middleware's cookie-presence check. It cannot authenticate real API operations and does not use real credentials. Close the window to stop the helper. This is fixture viewing, not authentication acceptance evidence. Omitting `--preview` runs browser checks and captures instead. Preview follows the actual browser window with `viewport: null`. The former fixed 1600x1100 emulation exceeded the native window height and clipped the visible page; the corrected headed preview exposes the complete available-personnel tray at 130%.

Compare with the existing Team Management tab on your separately authenticated current Alpha1 runtime. The standalone route remains development-only. Team Management now includes a Survey Manager-only launcher labeled Demo; it mounts the same mock workspace in a large dialog and never loads operational staffing into the chart. The launcher is disabled while an existing staffing editor/command owns the workspace. Existing retained demos and data were not used or reset.

## POC behavior

- 1 Manager, 3 Superintendents, 8 Chiefs, 18 assigned Instrument Men and 3 available Instrument Men, all fictional fixtures.
- Connector tree; personnel names, roles, teams, Areas and branch counts; collapsible Superintendent and Chief branches.
- Each Chief has a chevron/text control with a named accessible action, `aria-expanded` and `aria-controls`. Collapsed Chiefs show the current hidden-member count, hide child cards/connectors and remain valid drop targets. Proposed counts update during review; Cancel restores the prior count. Confirm retains collapse and updates the count. Reopening shows the current roster. Moving an intact collapsed crew preserves that collapse state; only a collapsed destination Superintendent opens to show the moved Chief.
- Chart-only toolbar: 44px magnifier-minus and magnifier-plus buttons, percentage and Reset to 100%. The icon buttons retain Zoom Out/In accessible names and tooltips. Range 50-150% in 10% steps; boundary controls disable. Controls are an absolute, unscaled overlay pinned 12px from the chart panel top-left, above the scrolling canvas in an isolated stacking context. An 86px top inset keeps personnel clear of the toolbar throughout panning. The chart panel is sized with `height: clamp(420px, 65vh, 720px)`. The canvas scrolls independently in both axes; the toolbar cannot cover personnel cards. Page scrolling reaches available personnel outside the panel. Zoom changes canvas overflow while panel, viewport, toolbar, tray and document geometry remain stable. The normal-sized toolbar, page/header, available-personnel tray and review dialogs do not scale. Zoom and collapse remain UI-local; refreshing resets both. Reset Demo resets staffing/collapse while retaining your zoom preference.
- Drag the six-dot grip on an Instrument Man to another Chief, or a Chief grip to another Superintendent. Chief moves carry their current Instrument Men, including prior local changes.
- Valid cards get dashed green borders; hovered valid cards show release guidance. Hovered invalid cards show rejection; current-parent drops are rejected. Arbitrary nesting is impossible.
- Valid drops project the new chart with dashed “Proposed” cards, then open the existing native review dialog. Source, destination, proposed Area, crew members and retained request/history facts are visible. Cancel, Close or Escape discard the projection. Confirm updates only local React state. Reset or refresh restores fixtures.
- Move / Move Crew buttons offer the same review flow using destination choices and keyboard controls. Focus returns to the person's action when visible, otherwise to the chart (for example after moving into a collapsed crew). Theme toggle is local and uses existing semantic light/dark values.
- No persistence, fetches, mutation APIs, graph library or new dependencies. “Retained” and “Unchanged” describe the illustrative move contract; no real requests are loaded or verified by this POC.

## Existing production behavior

`TeamManagementEntry` chooses the existing role-specific workspace. Managers have the reviewed SurveyReorganization workflow and existing personnel/team/Area editors; Superintendents have scoped teams and crew controls. Existing role-specific editors, commands, audit and request behavior are unchanged. TeamManagementEntry adds only the gated demo launcher.

## Backend capabilities that appear reusable

Source inspection of `reorganize-survey.ts` and `survey-reorganization.repository.ts` shows Manager-authorized preview/apply, checksums, active-work and consistency blockers, reason/confirmation, exclusive lifecycle coordination, atomic evidence, idempotency and exact retry handling. Existing UI preserves uncertain commands and requires reload after stale results. IM moves support linked, available and no-team surveyors; source/destination membership and multi-Area coverage are retained when teams change. No backend acceptance was rerun for this front-end POC.

## Backend gaps and production requirements

These are source observations and documented open work, not newly validated backend defects:

- The chart treats Superintendent, crew, named team and Area as one simple tree. Production keeps reporting links, Area coverage, named-team membership and responsibility grants distinct, supports multi-Area structures and different crew builds. A production chart must represent those distinctions rather than infer authority from nesting.
- An intact crew API exists, but is constrained: one unambiguous individual Chief Area; eligible Superintendent already covering the explicitly selected destination Area; consistent Chief-led named team and crew roster; active-work blockers when changing Area. Simply dropping on a Superintendent does not determine a safe Area. Superintendent-led team splits/intact transfers and crew reconciliation remain open in CODEX Batches 170–172.
- Read current scoped workforce, reporting, roster, team and Area evidence through authorized queries. Add bounded loading/search, errors, stale/revoked access and empty/project-state handling. Preserve server permissions and production navigation rules.
- Replace local projection with server preview; show all blockers and exact impact, collect a reason and renewed consent, retain body/key through uncertain outcomes, and revalidate before commit. Never silently rebase a stale move or rewrite existing request assignments/history.
- Verify actual PostgreSQL/HTTP/browser role, foreign scope, concurrent/stale/revoked/replay, rollback, audit and historical-preservation cases before approving production integration.

## What worked and what did not

Reporting and crew membership are easier to scan together than across separate forms. Whole-crew review names the included people and makes the scope explicit. Proposed placement plus Cancel avoids implying immediate commitment. Reusing the current buttons, dialog, Roboto and semantic palette keeps the surface recognizable. No changes to DESIGN.md or its sidecar are warranted for this disposable extension.

The expanded hierarchy is tall, but stays within the fixed chart viewport; available personnel follow the panel on the page. Distant drag destinations require internal scrolling. Collapse, zoom-out and click-based Move help, but the prototype does not validate auto-scroll ergonomics. At 50%, the structure fits better but personnel text and grips are small; use this for overview and zoom in for detailed work. At 150%, the canvas needs horizontal and vertical scrolling. A persistent available tray and targeted destination navigation are candidates for a later experiment, not implemented product requirements. At 797px and 390px, both scroll axes stay inside the chart viewport, but only part of the hierarchy is visible at once. Full touch dragging/mobile management remains unevaluated. Search and Area filtering are intentionally omitted as secondary to the drag experiment.

## Scaled drag/drop implementation

Native CSS `zoom` is applied only to `.org-chart`. Its fixed unzoomed width is the larger of 1190px and the chart viewport's content width, measured by ResizeObserver. A centered wrapper reserves the scaled layout width, allowing normal contained overflow. This retains the hierarchy's top edge and central alignment when it fits, while zoom changes only canvas overflow. The panel reserves top space for its absolute toolbar and uses a `minmax(0, 1fr)` grid row for the scroll viewport; stable scrollbar space preserves the measured unzoomed width.

CSS zoom scales browser layout and painted/hit-test coordinates together. HTML5 dragging uses the actual DOM target and native drag image, so there is no custom collision math, drag overlay or pointer-coordinate conversion to get out of sync. Browser tests aim at painted element rectangles and assert valid/invalid hover feedback before release, then verify the actual destination after review. IM moves pass at 50%, 100% and 150%; intact collapsed crews and invalid drops pass at 50% and 150%. Tested in installed Chromium/Edge; other browser engines were not exercised. No graph framework or new dependency was added. Ctrl/Cmd-wheel zoom is omitted; explicit toolbar controls meet the scope.

## Verification and removal

Baseline on the correct branch: `pnpm tsc --noEmit` passed; 590/591 unit tests passed in the sandbox, with the remaining test blocked by loopback EACCES. With loopback access, all 591 existing tests passed. Final strict typecheck, 594 unit tests (including 3 fixture-move tests) and production build pass on the installed host runtime. The host is Node 24.13.1; this is not a pinned Node 22 compatibility claim.

Twenty-two browser check groups cover fixture scale, actual native person/crew/available dragging, projected placement/cancel/confirm, invalid drop, keyboard selection/Escape/focus return, collapse, narrow overflow, refresh reset, zero API calls and zero page errors. Added cases cover all seven requested scaled-drag scenarios, valid/invalid target highlighting, minimum/100%/maximum zoom bounds and reset, preserved collapsed crews, canceled/projected/committed hidden counts, reopening current roster and unchanged toolbar/header/tray/dialog sizes. A 1366×768 check verifies identical panel/viewport/toolbar/tray/document geometry at 50%, 60%, 70%, 100%, 130% and 150%; independent canvas scrolling with the unscaled top-left overlay stationary and clear of cards; and page scrolling to every available card. Native drops after canvas scrolling pass at 50%, 100% and 150%, with nonzero offsets in both axes at 150%. A reported-window 1915x948 check verifies the complete tray at 130% and icon semantics. Historical evidence before the fixed-panel refinement: a real maximized headed Edge preview used a 1912x948 client viewport and showed every available card, Move control and footer in full. Geometry was also tested at 1600×1100, 797×1000 and 390×844; drag matrices pan the bounded chart viewport with the native drag held, then re-read destination coordinates. Long captures use taller narrow viewports to avoid Chromium offscreen text-layer capture artifacts. Raw captures and evidence are ignored under `.local/org-poc/`. Independent initial visual review returned **ship for exploratory desktop POC only** after corrected recaptures. No production readiness is claimed.

Refinement files: `survey-team-prototype.tsx`, `survey-team-prototype.css`, `tests/ui/survey-team-prototype-browser.mjs`, this README and an append to `docs/CODEX.md`. Fixtures and fixture tests are unchanged. TeamManagementEntry adds the gated launcher; operational modules and APIs remain untouched.

The prior independent refinement review inspected eight captures, including collapsed views at 50%, 100% and 150%, and returned **ship for exploratory POC only**, with no required material fixes. Read-only documentation review confirmed preservation of the existing DESIGN.md and sidecar.

The fixed-viewport review inspected current desktop, reported-window available-tray, 50%/150% collapsed and mobile captures; it returned **ship for exploratory POC only** with no material fixes. DESIGN.md and its sidecar remain unchanged.

The implementation now lives in `src/components/ui/survey-org-chart`; the standalone route retains compatibility reexports. See that directory README for workspace ownership, launch and verification.

To remove the packaged feature, remove its TeamManagementEntry import/launcher and the shared component directory, then delete this route directory and `tests/ui/survey-team-prototype{.test.ts,-browser.mjs}` to remove the POC. The historical CODEX entry can remain. No API, schema or migration changes need reverting.

