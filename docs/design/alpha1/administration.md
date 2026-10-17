# Tenant IT and Project Admin Design Record

This ordinary extension brings the existing Tenant IT and Project Admin screens into the approved Axiom workspace. It gives the existing tasks named sections, contained record tables and readable review areas while preserving current command and server authority. Use the [Alpha 1 design hub](README.md) for the complete branch inventory, evidence and future Alpha 2 integration; this record describes the administration increment.

The [surface brief](../../../.impeccable/surfaces/administration-refinement.md) owns its Operate-mode composition. [PRODUCT.md](../../../PRODUCT.md) remains the product contract, and [DESIGN.md](../../../DESIGN.md) with its [sidecar](../../../.impeccable/design.json) remains the incumbent visual system. This increment preserves those system files: it creates no new identity, global token vocabulary or shipping raster. Local screenshots are verification captures, not application assets.

## Implementation Map

| Source | Implemented responsibility |
| --- | --- |
| [AdministrationWorkspace and AdministrationArea](../../../src/components/ui/administration-workspace.tsx) | Page heading with independent scope help, wrapping section links and focusable anchor destinations |
| [Administration workspace styles](../../../src/components/ui/administration-workspace.css) | Flat administrative panels, responsive work areas, scoped record sizing and review boundaries |
| [Tenant Accounts page](../../../src/app/(projects)/accounts/page.tsx) | Tenant accounts and durable Central IT reviews, existing account search/server paging, separate disable and review-resolution decisions |
| [Project Admin page](../../../src/app/(projects)/projects/[projectId]/(admin)/admin/page.tsx) | Section navigation joining personnel, companies, settings, request policy, access/recovery and diagnostics |
| [ProjectAdministration](../../../src/components/ui/project-administration.tsx) | Existing personnel and independent grants, companies, setup/access settings, diagnostics and guarded command reviews |
| [ProjectCreation](../../../src/components/ui/project-creation.tsx) | Administered-project inventory in the launcher, existing create/recommission controls and links to administration |
| [AdministrationRecords and AdministrationSection](../../../src/components/ui/administration-records.tsx), [record styles](../../../src/components/ui/administration-records.css) | Existing semantic tables, mounted disclosures, loaded-record filter/sort/selection/export and bounded sticky scrolling; optional column classes identify state cells |
| [AccountShell](../../../src/components/ui/account-menu.tsx), [ProjectShellHeader](../../../src/components/ui/project-shell-header.tsx), [ProjectNav](../../../src/components/ui/project-nav.tsx) | Server-derived Tenant IT discovery within the universal sidebar/native drawer; current project context and capabilities remain independently validated |
| [Administrative browser runner](../../../tests/beta/admin-spaces-browser.mjs) | Opt-in owned-fixture checks and captures across authority, theme, viewport and lifecycle cases |

## Layout and Interaction

Tenant Accounts and Central IT Reviews share a two-column work area at viewport widths of at least 1500px, with a wider accounts column; below that they occupy one lane. Project personnel and company inventories remain full-width. The lighter settings area uses an auto-fitting grid whose columns have a bounded 28rem minimum. Panels inherit semantic Light/Dark surfaces, Roboto, existing rounded containers and square controls with at least 44px action targets. Phone panels use 1rem internal padding below 599px. The existing 224px desktop sidebar and native left drawer below 1000px remain the navigation frame.

The page heading uses a local fluid size (`clamp(1.5rem, 2vw, 2rem)`) and adjacent scope help. Wrapping section links are ordinary fragment anchors, with a 100px scroll margin on their targets and a visible focus treatment. They move within the mounted page without switching panels or remounting editors. AdministrationSection similarly hides mounted content rather than conditionally deleting its children. Section navigation therefore retains filter/editor values; it does not cancel, reload or discard a pending or uncertain command. Existing disclosure locks protect relevant sections while their command owner is active.

Project section links name Personnel, Companies, Settings, Access and Recovery, and Diagnostics. Request Policy appears after configuration has loaded for a non-archived project. The settings anchor remains a stable mounted destination even when current lifecycle state leaves its settings area empty. Existing setup eligibility and archived-project restrictions still determine the controls that render.

## Record Treatment and Help

The new table treatment is scoped to AdministrationWorkspace and the ProjectCreation administration inventory. It gives their scrollable tables a 720px minimum width and readable 0.875rem text while retaining the shared 22rem maximum scroll viewport and sticky heading row. Ordinary textual cells wrap long names, email addresses, reasons and references; action rows remain together on one line inside horizontal overflow. Controls precede the viewport and pagination follows it. The page itself stays within the viewport.

Account access, review status, project-member access, independent Project Admin grant and project lifecycle cells use the existing neutral pill badge with explicit readable state labels. The dedicated state column and max-content badge sizing keep those labels on one line. Color supplements the wording and does not imply new risk or workflow semantics. Company names remain prominent; an existing native disclosure exposes the exact company reference.

Shared HeadingHelp/HelpHint makes supplemental page, Card and disclosure introductions available independently of neighboring actions. Title case applies to headings and table labels; supplied names and identifiers remain intact. Table captions preserve an adjacent sideways-scroll instruction when actual overflow is measured. Local filtering, sorting, selection and CSV export apply to supplied loaded rows. Tenant accounts and reviews retain their separate server paging; loaded-table filtering does not become a full-tenant search.

Destructive scope and decision facts stay inline. Examples include the original local lifecycle evidence and separate tenant decision in Central IT review, each person's blocker evidence/reason/confirmation during access removal, archived-project history and restrictions, project creation's Setup status, and the exact project action being confirmed. Loading, empty states, errors, success, uncertain-retry notices and stale-state reload instructions remain visible in their current flow.

## Preserved Authority and Commands

AccountShell obtains `canCreateProject` from the existing project-administration inventory and binds the result to the current pathname. ProjectShellHeader passes that flag to navigation; ProjectNav uses it to expose Tenant IT → Tenant Accounts. Errors or an unmatched pathname suppress that discovery. The flag supplies navigation only. Destination APIs still authorize every read/action, and TENANT_ADMIN gains no project request visibility from this link. Actual current project capabilities continue to govern independent Project Admin destinations and coexist with operational roles.

The extension retains existing endpoints, eligibility, closed/setup checks, command owners, explicit consent, reasons, evidence, immutable uncertain body/key retries and deliberate reload after definitive stale state. Project removal and tenant account disable remain separate confirmed decisions. Record selection is a review/export convenience and does not itself grant authority or perform destructive actions. No domain module, API handler, migration or dependency changes belong to this presentation increment.

## Checkpoints and Verification Scope

| Checkpoint | Purpose |
| --- | --- |
| `bc4c806` | Central Alpha 1 design reference and future Alpha 2 integration hub |
| `d5c0917` | Tenant IT/Project Admin workspace implementation |
| `c3cb158` | Neutral access/state badge alignment and responsive administrative browser coverage |

The fresh independent finish reviewer opened all 18 required captures from `.impeccable/review/administration/current` and returned **ship**, with no material fixes. The captured matrix covers Tenant IT-only and local independent Project Admin in Light/Dark at 1864px, 797px and 390px, plus desktop members/grants, desktop access blockers, mobile Central IT review, Setup administration, archived administration and the IT administered-project inventory. The fluid h1 detector advisory was accepted as having no material readability issue in that evidence. The verdict is a visual finish disposition for the captured packet. Keyboard behavior, motion, System switching and unshown editors are outside that screenshot verdict; it does not establish exhaustive accessibility, security, device or release acceptance.

The administrative runner reports 18 grouped browser checks and 18 captures. Its assertions cover shell/help/section presence, page containment, bounded record viewports and single-line badges; retained editor text after an anchor jump; visible actual blocker/original review evidence; setup/archived affordances; and direct API denial for a Manager lacking the independent grant. A grouped check is a recorded scenario with several assertions, not a claim of 18 exhaustive test cases.

Parent verification separately records current strict/unused production types, 566 unit/route tests and the pinned Node 22.23.3/pnpm 11.19.0 production build, plus 27 PostgreSQL suites, 52 production HTTP checks, 24 lifecycle browser checks, 26 lost-response browser checks and 55/55 named cases after the badge correction. The [administration evidence](../../../audits/alpha1-ui-redesign/administration-evidence.json) binds these gates, grouped administrative checks, capture hashes and scoped review to source/migration digest `493d60d7ff28a7dbb3c759971b946578511ee675e9a6130e6d8e63496d43ebbf`. Those suites are separate from the 18-capture visual verdict and were not rerun by this documenter. The [hub](README.md) and [batch history](../../CODEX.md) connect the evidence with integration history; counts from earlier receipts must not be added to current-source acceptance. The documenter checked the listed source/contracts, current evidence, runner and capture inventory, and opened representative desktop Light Tenant IT and phone Dark Project Admin captures to compare the implementation with the incumbent system.

## Incumbent Drift and Alpha 2 Integration

The existing sidecar's Administration Disclosure preview uses native `details`/`summary`, while the incumbent AdministrationSection implementation uses a button with `aria-expanded` and mounted hidden content. That pre-existing preview drift is reported here and left intact. The design system's ordinary 640px record and 560px chart-record guidance still describes those shared treatments; this extension's 720px minimum is a local administrative override, not a silent rewrite of the global standard. No broad design repair is part of this handoff.

Preserve these checkpoints with the complete design branch when Alpha 2 integration is authorized. Reconcile administrative capability discovery, current hardening contracts, shared record/help behavior and guarded editors together with the latest hardening work. Use the [central integration instructions](README.md#integrate-when-alpha-2-is-authorized) and rerun combined-source acceptance on newly owned disposable fixtures. This record creates no branch, merge, push, deployment or Alpha 2 initialization and changes no retained customer state.
