---
name: SWRTracker
description: Axiom Civil Services foundation for accessible appearance and authorized survey record work.
colors:
  brand: "#4682b4"
  action: "#315f85"
  accent: "#ffa500"
  ink: "#2e2e2e"
  muted: "#58636e"
  bg: "#f5f7f9"
  bg-elevated: "#ffffff"
  line: "#d8dfe5"
  line-strong: "#81909d"
  brand-ink: "#ffffff"
  surface-hover: "#edf3f8"
  surface-selected: "#e9f1f7"
  surface-sunken: "#f5f8fb"
  success: "#0f7b52"
  warn: "#b06a11"
  danger: "#b23833"
  dark-bg: "#111820"
  dark-bg-elevated: "#19242e"
  dark-ink: "#e7edf2"
  dark-muted: "#b4c2ce"
  dark-line: "#3e5060"
  dark-line-strong: "#8397a8"
  dark-action: "#a6cce9"
  dark-action-hover: "#c1def3"
  dark-brand-ink: "#111820"
  dark-surface-hover: "#243440"
  dark-surface-selected: "#2b4050"
  dark-surface-sunken: "#14202a"
  dark-success: "#84deb5"
  dark-warn: "#f3ca83"
  dark-danger: "#ffb3ad"
typography:
  title:
    fontSize: "1.25rem"
    fontFamily: "Roboto, sans-serif"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Roboto, sans-serif"
    lineHeight: 1.5
  label:
    fontFamily: "Roboto, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 600
  field:
    fontFamily: "Roboto, sans-serif"
    fontSize: "16px"
    lineHeight: 1.35
  home-heading:
    fontFamily: "Roboto, sans-serif"
    fontSize: "clamp(1.4rem, 2vw, 1.8rem)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  home-value:
    fontFamily: "Roboto, sans-serif"
    fontSize: "1.65rem"
    fontWeight: 700
    lineHeight: 1.2
  compact-title:
    fontFamily: "Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
  home-action:
    fontFamily: "Roboto, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 700
  workspace-link:
    fontFamily: "Roboto, sans-serif"
    fontSize: "0.875rem"
  workspace-note:
    fontFamily: "Roboto, sans-serif"
    fontSize: "0.9rem"
  home-support:
    fontFamily: "Roboto, sans-serif"
    fontSize: "0.85rem"
  compact-body:
    fontFamily: "Roboto, sans-serif"
    fontSize: "0.8rem"
  compact-tools:
    fontFamily: "Roboto, sans-serif"
    fontSize: "0.75rem"
  home-stat-note:
    fontFamily: "Roboto, sans-serif"
    fontSize: "0.72rem"
  heading-help:
    fontFamily: "Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  compact-badge:
    fontFamily: "Roboto, sans-serif"
    fontSize: "0.7rem"
rounded:
  navigation: "0px"
  button: "0px"
  control: "10px"
  ticket: "12px"
  panel: "12px"
  pill: "999px"
spacing:
  stack: "0.75rem"
  panel-gap: "1rem"
  page-gap: "1.25rem"
  panel-wide: "1.5rem"
  record-cell: "12px 10px"
  compact-record-cell: "0 0.35rem"
  home-panel: "1rem"
  section-content: "8px 0 16px"
  heading-help-gap: "0.25rem"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.button}"
    padding: "0.55rem 0.95rem"
  button-secondary:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0.55rem 0.95rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.bg-elevated}"
    rounded: "{rounded.button}"
    padding: "0.55rem 0.95rem"
  input:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.control}"
    padding: "0.62rem 0.7rem"
  navigation-link:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.navigation}"
    padding: "0.45rem 0.75rem"
  status-badge:
    rounded: "{rounded.pill}"
    padding: "0.22rem 0.6rem"
  ticket-card:
    backgroundColor: "{colors.bg-elevated}"
    rounded: "{rounded.ticket}"
    padding: "0.85rem 0.95rem"
  panel:
    backgroundColor: "{colors.bg-elevated}"
    rounded: "{rounded.panel}"
    padding: "1.25rem"
  view-tab:
    textColor: "{colors.muted}"
    rounded: "{rounded.navigation}"
    padding: "0.5rem 0.9rem"
  project-sidebar-link:
    textColor: "{colors.ink}"
    typography: "{typography.workspace-link}"
    rounded: "{rounded.navigation}"
    padding: "0.6rem 0.75rem"
    height: "46px"
  project-sidebar-current:
    backgroundColor: "{colors.surface-selected}"
    textColor: "{colors.ink}"
    typography: "{typography.workspace-link}"
    rounded: "{rounded.navigation}"
    padding: "0.6rem 0.75rem"
    height: "46px"
  project-sidebar:
    backgroundColor: "{colors.bg-elevated}"
    padding: "1.25rem 0.75rem"
    width: "224px"
  project-navigation-drawer:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.ink}"
    width: "min(340px, calc(100vw - 24px))"
    height: "100dvh"
  project-account-sign-out:
    textColor: "{colors.ink}"
    typography: "{typography.workspace-link}"
    rounded: "{rounded.navigation}"
    padding: "0.6rem 0.75rem"
    height: "46px"
    width: "100%"
  home-panel:
    backgroundColor: "{colors.bg-elevated}"
    rounded: "{rounded.panel}"
    padding: "{spacing.home-panel}"
  home-summary:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  compact-record-header:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.compact-body}"
    padding: "{spacing.compact-record-cell}"
  compact-record-cell:
    textColor: "{colors.ink}"
    typography: "{typography.compact-body}"
    padding: "{spacing.compact-record-cell}"
  record-table-header:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    padding: "{spacing.record-cell}"
  record-table-cell:
    textColor: "{colors.ink}"
    padding: "{spacing.record-cell}"
  chart-review-action:
    textColor: "{colors.action}"
    typography: "{typography.compact-body}"
    rounded: "{rounded.button}"
    padding: "0.4rem 0.65rem"
    height: "44px"
  heading-help-trigger:
    textColor: "{colors.muted}"
    rounded: "{rounded.button}"
    padding: "12px"
    width: "44px"
    height: "44px"
  heading-help-popover:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.ink}"
    typography: "{typography.heading-help}"
    rounded: "{rounded.panel}"
    padding: "0.85rem 1rem"
    width: "min(340px, calc(100vw - 32px))"
  administration-disclosure:
    textColor: "{colors.ink}"
    padding: "12px 0"
    width: "100%"
---

# Design System: SWRTracker

## Overview

**Creative North Star: "Axiom Civil Services"**

The pinned visual authority is the Axiom Civil Services Brand Guide, version 1.0, September 2026, supplied at `D:/Programming/_references/Axiom Brand/Axiom_Civil_Services_2026_Brand_Guide.pdf`. Future UI work must follow that identity. This document records the implemented shared foundation; it does not create a replacement identity or introduce product claims.

The light interface uses white surfaces, slate text, steel blue structure, restrained orange attention, and Roboto throughout. The dark interface carries the same hierarchy through deep slate surfaces and lighter readable text. Personal display preferences and authorized tenant color customization extend that established world.

Record collections share semantic tables with filtering, sorting, selection and useful selection actions across authenticated roles. Every authenticated screen uses a persistent desktop sidebar and a shared workspace, with explicit authorized project context when available; compact dashboard records reuse the same table primitive. Role-specific workflow controls and their existing evidence remain visible within that structure.

**Key Characteristics:**

- White or deep slate surfaces with readable text.
- Axiom defaults, validated tenant accents and derived accessible actions.
- Supplied Axiom artwork and self-hosted Roboto.
- Compact task controls with visible keyboard focus.
- Grouped project navigation, explicit project context and scoped Home summaries.
- Filterable, sortable, selectable records with explicit scope and collapsible secondary sections.

## Colors

The palette follows the supplied Axiom identity and the approved tenant branding extension; operational state colors supplement it where their meaning is explicit. Frontmatter light values are the global fallback palette; `dark-*` values record the static dark-mode overrides from `src/app/appearance.css`. Authenticated tenant colors and the derived action colors apply at runtime.

### Primary

- **Steel Blue** (`brand`): global structural fallback for selected outlines and the header rule. Authenticated views use the saved tenant primary color for this role; the Axiom default chosen in Appearance uses the Action Blue primary.
- **Action Blue** (`action`): global readable action fallback for active navigation, caret, focus and primary buttons. Authenticated views derive this role from the tenant primary color against the current elevated surface, targeting at least 4.5:1 contrast. The runtime hover role follows that derived action color; static fallback hover remains separately defined.
- **Action Label** (`brand-ink`): primary button text derived from the action fill's luminance, choosing dark slate or white for readable labels. It is independent of the panel background.

### Secondary

- **Orange** (`accent`): reserved for limited attention. Its availability does not require decorative use on each screen.

### Neutral

- **Slate** (`ink`): primary text.
- **Muted Slate** (`muted`): secondary copy and field labels.
- **Cool Background** (`bg`): page canvas.
- **White** (`bg-elevated`): light panels, navigation and controls.
- **Divider** (`line`): quiet panel and navigation boundaries.
- **Strong Divider** (`line-strong`): field outlines.
- **Quiet Surface States** (`surface-hover`, `surface-selected`, `surface-sunken`): hover, selected and recessed regions, including table headers.
- **Deep Slate and Light Slate** (`dark-bg`, `dark-bg-elevated`, `dark-ink`, `dark-muted`): dark canvas, elevated regions and their text hierarchy. The dark divider, strong divider and surface-state roles preserve the same boundaries and interactions.

Error, warning, success, and neutral badges retain their implemented foreground/background/border combinations in the global and appearance stylesheets. Use their text labels to convey state; color is supplementary. `danger` is the destructive button fill. Generated tonal strips in the sidecar are preview aids, not additional approved application tokens.

**The Brand Authority Rule.** Preserve the supplied Axiom artwork and Roboto; use Axiom color defaults unless an authorized Central/Tenant IT administrator changes the tenant primary and accent colors.

**The Readable Action Rule.** Derive action and action-label colors from the saved tenant primary and current display mode; keep safety status meanings independent of tenant customization.

**The Personal Appearance Rule.** Every authenticated role can save LIGHT, DARK or SYSTEM for their own account. Only current TENANT_ADMIN authority can customize colors shared by the tenant.

## Typography

Roboto is the display and body family with a generic sans-serif fallback. The normal variable face covers weights 100–900 and uses `font-display: swap`. It is served from `public/fonts/roboto-variable.ttf`, sourced from [Google Fonts Roboto](https://github.com/google/fonts/tree/main/ofl/roboto); retain `public/fonts/OFL.txt` with redistribution.

Titles use bold weight and tight tracking; their sizes remain appropriate to the actual heading level. Body copy uses the body role; labels use the label role, and inputs use the field role. Buttons use weight 700. Product identity uses the compact-title size in the application shell and 1.125rem in authentication. Ordinary status badges use 0.76rem text, step labels use the label size, utility/sidebar navigation uses workspace-link, and in-page view tabs use 0.925rem.

Home adds explicit data-display roles to this Roboto foundation. The fluid home-heading role identifies the named greeting; home-value gives summary counts tabular numerals. Compact titles identify Home panels and project context. The home-action role identifies the requester intake link and drawer title, with the intake label using compact-title at phone widths. Workspace notes and Home empty states use workspace-note; the former inline intake supporting copy used home-support; it now uses the heading-help role in its question-mark popover. Compact-body covers table records, summary labels, dates, scope and project-role context. Compact-tools covers table controls and navigation group labels; the former inline summary date qualifiers used home-stat-note and now use heading-help, and compact-badge keeps status labels inside Home tables and phone project context. These roles document the implemented shell/Home hierarchy; they do not replace the existing Operations hierarchy.

**The Heading Case Rule.** Use grammatical title case for interface headings, table captions, column headings and metric labels, including “Recent Requests” and “Submit a New Survey Request”. Keep interior articles, conjunctions and short prepositions lowercase; preserve acronyms, identifiers and supplied person, project, company and team names. Help prose remains sentence case.

## Layout

The sticky elevated account header retains the Axiom wordmark and greeting. Every authenticated screen, including Projects, Appearance, Profile and Assignment Details, shares the full viewport-width header and workspace. A persistent 224px elevated sidebar starts flush at the left frame edge beside a shrinking content column; its top follows the account header and its destinations scroll independently. Account destinations live in this left navigation, with no redundant top-right Menu. The authorized project name, current role with additive administration, and lifecycle badge sit in a bordered context row above page content when current access is available. Workspace content has 1.2rem top, 1.5rem side and 2rem bottom padding. Forms and long text retain the 760px reading width; text fields cap at 40rem and date/number fields at 18rem. Ordinary panels retain their responsive padding. Control groups may wrap and panels allow contents to shrink with `min-width: 0`; status bubbles and chart review action labels remain on one line.

Below 1000px the sidebar gives way to a Project navigation trigger and a native left modal drawer on every authenticated screen, including a fresh Projects launcher without selected project context. It has a fixed title/Close header and independently scrolling destinations. The drawer is full height and capped at 340px, leaving at least 24px of backdrop at narrow widths. Native modality protects focus; Close, Escape and backdrop dismissal restore the trigger. Selecting a route closes it, and widening to desktop dismisses it. Navigation has no bottom tab bar. Below 600px workspace content uses .9rem top, .75rem side and 1.5rem bottom padding. At 600px and below the account header shows the supplied Axiom icon instead of the wordmark, and the greeting truncates on one line.

Home places its named greeting and visible UTC date above a four-column summary strip. Its dashboard uses two unequal columns from 1200px, with the wider record column ordered by audience; below that it becomes one content lane. Below 600px summaries use two columns. Home panels use the shared panel shape with flat depth and compact padding, retaining their contained boundaries on phones. The requester intake action, scoped summaries, compact request/date records and existing charts form the first workspace; the role-specific composition is recorded in `.impeccable/surfaces/alpha1-project-home.md`.

Record collections use semantic tables at all widths, with filtering and selection controls before the table and pagination after it. Ordinary tables retain the 640px phone minimum and sideways-scroll hint. Home uses the same primitive's compact variant with a tools disclosure and a 640px minimum at every breakpoint; loaded-table scope help beside the card heading preserves the instruction to scroll sideways to every column and action. Ordinary table captions expose their overflow guidance through adjacent help when the table actually overflows. Keep page content within the viewport while the table scrolls. Existing request card markup can remain inside record cells; the older 900px request-card layout is a subordinate content treatment, not the standard for new record lists. The request detail page uses a main column plus a sticky Actions panel from 1100px; below that, Actions follow the request details. Historical Decision 16's right account overlay and the first Alpha 1 project-only sidebar exception were superseded by the owner's later universal sidebar annotations.

Appearance has a 900px maximum page width inside the shared workspace and an explicit Back link to a validated prior internal authenticated route, with authorized Home or Projects as fallback. Mode options wrap with 24px gaps and 44px targets; tenant color controls wrap with 32px gaps. Secondary administration groups collapse within panels rather than introducing a new page hierarchy. Reporting charts keep their established composition and expose exact table data through disclosure sections. Recorded chart tables use a bounded 22rem scroll viewport with sticky headings, a 560px minimum table width and single-line labels/actions; filter, selection, export and paging controls remain outside that viewport.

Authentication uses a centered shell capped at 460px with centered branding and a full-width primary action. Preserve the existing route structure and role-specific navigation.

## Elevation & Depth

Panels use the elevated surface with a thin divider border and one quiet shadow token (`--shadow-panel`). Interactive cards use `--shadow-raised` and a brand border on hover; record tables remain flat with row dividers and a recessed header. Nested panels have no shadow. The header's sticky positioning and three-pixel brand top rule provide structure without ornamental depth. Dark mode uses tonal surface separation with the same component geometry.

Authenticated navigation uses one native left modal with a dimmed backdrop (`rgb(15 25 35 / 55%)`) and no slide animation. The sidebar and Home dashboard panels are flat; surface tones and dividers supply their hierarchy in both appearance modes. The earlier right account overlay and its slide timings are historical implementation details, superseded by the universal shared shell.

## Shapes

Buttons and visually button-like navigation use square corners. Inputs and banners retain the 10px control radius. Ticket cards and panels have their own slightly larger corners. Status badges are pills; numbered steps use circular markers and straight underline progress indicators. Maintain these functional distinctions rather than assigning one radius everywhere.

## Components

### Buttons

Primary actions use the action role and derived action-label color; secondary actions use the elevated surface with a divider border and primary text; destructive actions use the danger fill. All have a minimum height of 44px, weight 700, and the documented control padding. Hover uses the action-hover and surface-hover roles; destructive hover follows the implemented mode-specific treatment. Disabled buttons have opacity 0.45 and a not-allowed cursor. Color transitions take 150ms with `ease`; reduced-motion preference removes the transition.

The owner approved straight-edged buttons on 2026-10-01. The shared button-radius token is zero; general structural containers retain their existing rounding.

### Heading Help

Shared HeadingHelp/HelpHint places a question-mark control beside the appropriate heading using the heading-help-gap spacing role. The trigger uses the heading-help-trigger geometry with a 20px inline SVG. Muted text becomes the action color over the hover surface on hover or while open; keyboard focus has a two-pixel action outline with a two-pixel offset. The popover uses the heading-help-popover surface, shape and type roles, with a one-pixel strong-divider border, no added shadow and inherited Roboto. It stays within a 16px viewport gutter, scrolls internally if needed and repositions on scrolling or resize.

Native auto popovers enter the top layer on hover or focus. Clicking or tapping pins the help; clicking again, Escape or outside dismissal closes it. A 180ms pointer-leave delay lets the pointer cross into the help without losing it. Preserve the accessible “About [heading]” label, described-by relationship and expanded state. Keep each help control independent of its neighboring link, summary or button: Home summary help must not navigate, and Linked-Crew KPIs help remains immediately beside the measured label without toggling its separate native disclosure.

**The Supplemental Help Rule.** Put explanatory heading subtext and Card descriptions in adjacent help while keeping data, alerts, validation, loading and empty states, and confirmation facts visible. Preserve the full scope, date definitions, provenance limits and scroll guidance in that help; do not discard them to make the heading quieter.

### Inputs / Fields

Inputs, selects, and textareas use the elevated surface with a one-pixel strong-divider border and the field type role. Labels sit above with a 0.35rem gap. Textareas start at 100px height and resize vertically. Placeholders retain the muted text color at full opacity.

### Record tables and selection

Tables carry a visible caption, scoped column headers, tabular numerals, row dividers and left-aligned cells. Header and body cells use the record-cell spacing role; headers use the recessed surface. Sort buttons expose `aria-sort`, and the scroll region is keyboard reachable with an accessible label. Row checkboxes have record-specific labels; the header checkbox selects eligible rows on the current internal page. The shared table paginates 25 records at a time, with a visible range and Previous/Next controls.

Request description columns retain a readable minimum width (22rem) and wrap long words with `overflow-wrap: break-word`. Ticket List and Project Review reuse this shared column treatment; the table scroll region accommodates the width on narrow screens. Request types and priorities use the shared display labels in both rows and CSV exports. Request-type columns keep those labels intact with `white-space: nowrap` and `overflow-wrap: normal`.

Home's optional compact variant moves filter/selection/export tools behind a 44px “Filter and export” disclosure while retaining selection, sorting, CSV and internal pagination. Its table keeps an accessible caption, visually hidden because the card already names the collection. Loaded-record scope and the loaded-table sideways-scroll instruction are retained in help beside the containing card heading. Record values, selected counts and pagination ranges stay visible. The fixed-layout table has a 640px minimum at every breakpoint, with reference/status/date columns of 94/220/92px and contained horizontal scrolling. Reference links, ISO dates and status labels stay on one line; descriptions clamp to two lines. Badges use block max-content sizing with border-box padding, and the dedicated status column and compact-cell gutters keep them inside their own cell and separate from dates. Sort headers and request links retain 44px targets; compact type does not shrink those actions. Home planned badges use primary text (`ink`) over their existing planned surfaces to preserve readable labels with tenant customization in either mode.

Recorded chart categories, monthly values and Area/status values opt into the same record primitive's bounded scroll treatment. The viewport stops at 22rem, contains horizontal and vertical scrolling, and keeps the heading row sticky. Tables use a 560px minimum and compact-body type; labels and review actions do not wrap. Review requests/month actions use a 16px search icon, compact-body type and a 44px target. Column widths remain intrinsic rather than forcing the last column to 1%. Filtering, selection, export and pagination stay outside the viewport; the overflow hint appears only when the table actually overflows.

Filtering matches displayed column text; sorting uses numeric-aware, case-insensitive text comparison with a stable record-ID tie-breaker. Changing the filter or sort returns to the first internal page. A visible selected count accompanies Clear selection, Select all matching and Export selected. Matching selection spans the loaded collection, while header selection covers the current internal page; selected records are limited to the supplied rows and may remain selected when a filter hides them. CSV export includes the selected loaded records and readable column labels. Role eligibility and guarded mutation controls remain authoritative.

**The Loaded Records Rule.** State the scope of local filtering, sorting, selection and export. A server-paged view operates on its loaded records and does not promise a search of the full dataset.

**The Useful Selection Rule.** Give record selection a useful action, with selected-record CSV export as the shared default. Any mutation uses the existing guarded role controls and current authority.

### Administration disclosure and command states

Secondary management sections use a full-width disclosure control with `aria-expanded`, a divider above and vertically padded content. Hidden content leaves the layout. At compact widths the disclosure target is at least 48px tall. The active command remains visible and its relevant sections and conflicting controls lock while an attempt is pending or uncertain.

Loading, empty, success and error messages use readable text and the existing status/banner patterns in both modes. Appearance shows separate personal mode and Company branding controls; tenant color inputs include their hexadecimal values. Save, retry and reload controls describe their scope. An uncertain command retains the exact body and key for an unchanged retry; stale evidence requires deliberate reload. Guarded recommissioning keeps named replacement, retained-record review, readiness blockers, reason and confirmation visible, then exposes recorded reopening evidence in a native disclosure. This presentation does not grant operational authority through record selection.

### Navigation

Authenticated navigation groups Home, Work, People, Administration and Account, omitting empty groups. Independent administrative capability adds its destination alongside the actual operational role. Current project state and capabilities determine discoverable links; destination APIs remain authoritative. Square icon-led links are at least 46px tall, inherit primary text at rest, and use action text over the hover surface on hover. The current destination has primary text, selected-surface fill, bold weight and `aria-current="page"`. Below 1000px the same grouped destinations occupy the native left drawer on every authenticated route. Account contains Appearance, Profile, Assignment Details, Switch project and Sign out. Without a selected, currently authorized project, navigation shows Projects and Account destinations. Appearance, Profile, Assignment Details and Projects links retain project query context when authorized; existing Home and Team Management destinations are not duplicated. The last successfully authorized project is remembered per tab in sessionStorage and revalidated through current project inventory and capabilities; it is a navigation hint, never authority. Project content waits for current access, while account pages remain available if remembered access fails. Sign out is a full-width square 46px button with a top divider, primary text, hover surface and visible focus. It disables with “Signing out…” while pending, reports failures with an alert, and clears the remembered project and redirects to login only after the existing logout succeeds. No authenticated page has a redundant top-right Menu. In-page view switches (Operations, Project Review, Team Management) retain the square underline treatment. Keep the projects skip link, which becomes visible on focus and targets the main content.

### Home summaries

Four linked counts share a bordered, rounded strip with cell dividers, action-colored icons and tabular values. Hover changes only the surface. Labels state what the count measures; adjacent independent help retains date qualifiers and all-date definitions; the desktop chevron disappears below 1200px. At phone widths the strip becomes a two-by-two grid while each linked cell retains its generous padding. The date and Refresh Home action remain visible and wrap together. Summary and chart selections lead to matching existing scoped request views. Recent, upcoming and draft panels identify loaded-record limits in their heading help; summaries cover their authorized population rather than counting displayed rows. Current-state totals and upcoming UTC dates remain visually distinct, and crew distribution never implies productivity.

### Chips / Cards

**Status tones.** Every status maps to one tone in `src/lib/display-labels.ts`, shared by badges, legends and charts: neutral (draft), review (pending review), attention (returned, field review, delayed), planned (approved, scheduled), active (in progress, solid Action Blue), success (completed), danger (rejected only) and closed (cancellations). Badges are pills with a leading dot and always carry a readable label. Shared planned badges use primary text (`ink`) over their existing planned surfaces in Light and Dark, independently of tenant-derived action colors. Red is reserved for genuine exceptions. Chart colors per status are fixed (`STATUS_CHART_COLORS`), so a status keeps its color on every chart.

**Request cards.** Number and status on the first line, a two-line description, then Area path, type, Need-By and requester as icon-led metadata. An open request past its Need-By gets an amber left rule and an Overdue cue (icon plus text). Elevated priority shows a small amber flag chip. The whole card is the link (stretched link); workflow buttons sit in a card footer above it, with destructive buttons outlined rather than filled.

**Display vocabulary.** Codes never reach the UI raw: request types, priorities, roles and statuses use the shared label maps. Survey-facing views name requester cancellations "Canceled by requester".

**Detail page.** A header with the request number, status, Area path and type; return and rejection reasons as an amber callout; a bordered field grid; and a history timeline with a rail and tone-colored dots. Notifications recorded with an event fold into that event as a small "Requester notice" line.

Empty lists use a dashed empty-state block with a short explanation. Step chips show a numbered circle; completed steps are tinted, the current step is filled Action Blue, and on phones only the current step shows its name.

### Operations workspace

Queue health uses five clickable measures and a native details dialog, with a blue count heat map carrying numeric labels. Work queues use keyboard-navigable tabs, labeled filters, selectable page sizes, and native disclosure rows. Collapsed descriptions are ellipsized; expanded rows retain full descriptions and workflow controls. Metric values use 1.8rem tabular numerals; section headings use 1.25rem, summary rows 0.9rem, metric labels 0.875rem, and detail links 0.75rem. These are compact data-display roles, not a replacement type system. Overdue measures reuse the existing warning badge colors. Inputs retain the 10px radius; interactive buttons use square corners and tabs retain their square bottom selection rule.

Requester My Requests and field Crew Work reuse the KPI explorer through a compact chart-entry row and labeled native dialog. Requester opens on an authorized request-status donut; field opens on an open-request Area heat map. The entry leaves the queue visible and fetches charts only when opened. On narrow screens the Requester KPI field spans the dialog while visualization and grouping share a row when both fit; the dialog scrolls internally without horizontal page overflow.

The Survey Manager command overview is a compact, filter-first panel below queue health. It pairs an all-date status donut with a UTC daily demand/completion comparison, then switches the current-request distribution among Area, type, and Party Chief without changing the page layout. Keep exact daily values in a native disclosure table, readable counts on bars and legends, and scoped chart selections linked to the request review. At narrow widths, stack the filters and chart panels while retaining the Apply/Reset controls and visible scope text.

### Scroll controls

Back to top appears after meaningful page or contained scrolling. Its accessible 44px up-arrow targets the applicable scroll container, respects reduced motion and sits in the dialog native top layer. Dialogs reserve a footer while the arrow is shown; frozen Close controls stay in their header.

### Keyboard Focus

Focusable elements use a three-pixel solid action outline offset by three pixels. Fields keep the same outline with a one-pixel offset and action border. Administration disclosures and table sort buttons use a two-pixel action outline with a three-pixel offset. Retain visible focus across buttons, links, fields, scroll regions and navigation; never remove it without an equally visible replacement.

### Axiom Brand Lockup

`ProductBrand` combines the supplied artwork with the SWRTracker name. `public/brand/axiom-wordmark.png` is the unchanged `2026 Typography.png` source; `axiom-icon.png` is the unchanged `2026 Icon.png`. Both source canvases are 1600 × 1280. Provenance is retained in `public/brand/README.md`.

Do not redraw, recolor, stretch, or add effects. Preserve at least the A cap-height of clear space. The implementation trims only excess transparent canvas through its viewport: the application header frame is 168 × 56px with the source image rendered 132px wide, and the authentication frame is 200 × 80px with the image 160px wide. At 600px and below the application header shows the unchanged `axiom-icon.png` canvas at 52px wide in a 44px frame instead of the wordmark. Keep image proportions and visible clear space when changing the layout; frame dimensions alone are not a substitute for checking the artwork.

Dark mode gives the mark and icon frames a white backing, preserving the supplied artwork's colors and legibility without filtering the images.

## Do's and Don'ts

### Do:

- Do follow the Axiom Civil Services Brand Guide v1.0, September 2026, for future UI work.
- Do keep light surfaces white, dark surfaces deep slate, text readable and attention colors restrained.
- Do preserve the supplied logo, its proportions, and at least A cap-height clear space.
- Do retain self-hosted Roboto and its OFL license.
- Do retain visible keyboard focus, reduced-motion support, and readable state labels.
- Do use semantic tables with labeled filters, sortable headers, selection and useful export for record collections across authenticated roles.
- Do identify loaded-record scope and retain appropriate collapsible sections and chart data disclosures.
- Do separate account display mode from shared tenant branding and preserve current role authority.
- Do keep active commands visible, freeze uncertain attempts and require deliberate reload of stale evidence.
- Do keep project destinations square, keyboard focused and at least 44px tall, including compact Home actions.
- Do preserve scope and date definitions in adjacent heading help, visible request references and dates, and contained table scrolling in compact Home records.
- Do use grammatical title case for interface headings and keep supplemental help independent of neighboring actions.
- Do retain data, errors, loading and empty states, and confirmation facts in the visible interface.

### Don't:

- Don't replace the supplied artwork or Roboto, or expose tenant color customization beyond Central/Tenant IT.
- Don't use an unadjusted tenant primary in place of the readable action and action-label roles.
- Don't treat generated tonal previews as approved application colors.
- Don't introduce marketing claims or change task flows through visual refinement.
- Don't describe loaded-page filtering as a full-dataset search or let selection grant a new mutation permission.
