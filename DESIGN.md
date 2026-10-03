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
  dialog-backdrop: "rgb(10 20 30 / 45%)"
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
  section-content: "8px 0 16px"
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
  project-tab:
    textColor: "{colors.muted}"
    rounded: "{rounded.navigation}"
    padding: "0.5rem 0.9rem"
  record-table-header:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    padding: "{spacing.record-cell}"
  record-table-cell:
    textColor: "{colors.ink}"
    padding: "{spacing.record-cell}"
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

Record collections share semantic tables with filtering, sorting, selection and useful selection actions across authenticated roles. The recorded system follows the shared appearance, record, account-menu and recommissioning implementations alongside the incumbent global styles and layouts. Role-specific workflow controls and their existing evidence remain visible within that structure.

**Key Characteristics:**

- White or deep slate surfaces with readable text.
- Axiom defaults, validated tenant accents and derived accessible actions.
- Supplied Axiom artwork and self-hosted Roboto.
- Compact task controls with visible keyboard focus.
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

Titles use bold weight and tight tracking; their sizes remain appropriate to the actual heading level rather than a newly invented display scale. Body copy uses the body role; labels use the label role, and inputs use the field role. Buttons use weight 700. Product identity uses a 1rem, weight-700 label in the application shell and 1.125rem in authentication. Status badges use 0.76rem text, step labels 0.82rem, utility navigation 0.875rem, and desktop project tabs 0.925rem.

## Layout

The shell is a sticky elevated header (Axiom wordmark, greeting, account Menu) above a sticky elevated **project band**: project name, the viewer's project role, and the project section tabs. Content shares a centered container capped at 1280px (`--shell-max`) with a 1rem gutter, 1.25rem from 760px. Forms and long text use a 760px reading width (`.form-narrow`); text fields cap at 40rem and date/number fields at 18rem. Panels have 1.25rem padding, 1.5rem from 760px and 1rem at 600px and below. Rows wrap; panels allow their contents to shrink with `min-width: 0`.

Below 760px the section tabs become a fixed **bottom tab bar** (icon plus label, 60px targets, safe-area aware) and top-level panels run edge to edge. At 600px and below the header shows the supplied Axiom icon instead of the wordmark, and the greeting truncates on one line.

Record collections use semantic tables at all widths, with filtering and selection controls before the table and pagination after it. The shared table has a horizontal scroll region; at 600px and below its minimum width is 640px and an explicit sideways-scroll hint appears. Keep page content within the viewport while the table scrolls. Existing request card markup can remain inside record cells; the older 900px request-card layout is a subordinate content treatment, not the standard for new record lists. The request detail page uses a main column plus a sticky Actions panel from 1100px; below that, Actions follow the request details. Account navigation remains the approved right-side overlay (Decision 16).

Appearance has a 900px maximum page width. Mode options wrap with 24px gaps and 44px targets; tenant color controls wrap with 32px gaps. Secondary administration groups collapse within panels rather than introducing a new page hierarchy. Reporting charts keep their established composition and expose exact table data through disclosure sections.

Authentication uses a centered shell capped at 460px with centered branding and a full-width primary action. Preserve the existing route structure and role-specific navigation.

## Elevation & Depth

Panels use the elevated surface with a thin divider border and one quiet shadow token (`--shadow-panel`). Interactive cards use `--shadow-raised` and a brand border on hover; record tables remain flat with row dividers and a recessed header. Nested panels have no shadow. The header's sticky positioning and three-pixel brand top rule provide structure without ornamental depth. Dark mode uses tonal surface separation with the same component geometry.

The account overlay retains its approved dimmed backdrop, full-height right drawer and quick slide: opening takes 260ms and closing 180ms with `cubic-bezier(0.16, 1, 0.3, 1)`. Reduced motion removes the slide and backdrop transition. The page stays stationary beneath the overlay.

## Shapes

Buttons and visually button-like navigation use square corners. Inputs and banners retain the 10px control radius. Ticket cards and panels have their own slightly larger corners. Status badges are pills; numbered steps use circular markers and straight underline progress indicators. Maintain these functional distinctions rather than assigning one radius everywhere.

## Components

### Buttons

Primary actions use the action role and derived action-label color; secondary actions use the elevated surface with a divider border and primary text; destructive actions use the danger fill. All have a minimum height of 44px, weight 700, and the documented control padding. Hover uses the action-hover and surface-hover roles; destructive hover follows the implemented mode-specific treatment. Disabled buttons have opacity 0.45 and a not-allowed cursor. Color transitions take 150ms with `ease`; reduced-motion preference removes the transition.

The owner approved straight-edged buttons on 2026-10-01. The shared button-radius token is zero; general structural containers retain their existing rounding.

### Inputs / Fields

Inputs, selects, and textareas use the elevated surface with a one-pixel strong-divider border and the field type role. Labels sit above with a 0.35rem gap. Textareas start at 100px height and resize vertically. Placeholders retain the muted text color at full opacity.

### Record tables and selection

Tables carry a visible caption, scoped column headers, tabular numerals, row dividers and left-aligned cells. Header and body cells use the record-cell spacing role; headers use the recessed surface. Sort buttons expose `aria-sort`, and the scroll region is keyboard reachable with an accessible label. Row checkboxes have record-specific labels; the header checkbox selects eligible rows on the current internal page. The shared table paginates 25 records at a time, with a visible range and Previous/Next controls.

Request description columns retain a readable minimum width (22rem) and wrap long words with `overflow-wrap: break-word`. Ticket List and Project Review reuse this shared column treatment; the table scroll region accommodates the width on narrow screens. Request types and priorities use the shared display labels in both rows and CSV exports. Request-type columns keep those labels intact with `white-space: nowrap` and `overflow-wrap: normal`.

Filtering matches displayed column text; sorting uses numeric-aware, case-insensitive text comparison with a stable record-ID tie-breaker. Changing the filter or sort returns to the first internal page. A visible selected count accompanies Clear selection, Select all matching and Export selected. Matching selection spans the loaded collection, while header selection covers the current internal page; selected records are limited to the supplied rows and may remain selected when a filter hides them. CSV export includes the selected loaded records and readable column labels. Role eligibility and guarded mutation controls remain authoritative.

**The Loaded Records Rule.** State the scope of local filtering, sorting, selection and export. A server-paged view operates on its loaded records and does not promise a search of the full dataset.

**The Useful Selection Rule.** Give record selection a useful action, with selected-record CSV export as the shared default. Any mutation uses the existing guarded role controls and current authority.

### Administration disclosure and command states

Secondary management sections use a full-width disclosure control with `aria-expanded`, a divider above and vertically padded content. Hidden content leaves the layout. At compact widths the disclosure target is at least 48px tall. The active command remains visible and its relevant sections and conflicting controls lock while an attempt is pending or uncertain.

Loading, empty, success and error messages use readable text and the existing status/banner patterns in both modes. Appearance shows separate personal mode and Company branding controls; tenant color inputs include their hexadecimal values. Save, retry and reload controls describe their scope. An uncertain command retains the exact body and key for an unchanged retry; stale evidence requires deliberate reload. Guarded recommissioning keeps named replacement, retained-record review, readiness blockers, reason and confirmation visible, then exposes recorded reopening evidence in a native disclosure. This presentation does not grant operational authority through record selection.

### Navigation

Project sections are underline tabs with icons in the project band: muted at rest, Action Blue with a 3px underline when current, pale blue on hover, minimum 46px tall. On phones they become the bottom tab bar with a 3px top indicator. Role-to-section mapping and labels are unchanged; icons are presentation only. In-page view switches (Operations, Project Review, Team Management) use the same underline treatment. Keep the projects skip link, which becomes visible on focus and targets the main content.

### Chips / Cards

**Status tones.** Every status maps to one tone in `src/lib/display-labels.ts`, shared by badges, legends and charts: neutral (draft), review (pending review), attention (returned, field review, delayed), planned (approved, scheduled), active (in progress, solid Action Blue), success (completed), danger (rejected only) and closed (cancellations). Badges are pills with a leading dot and always carry a readable label. Red is reserved for genuine exceptions. Chart colors per status are fixed (`STATUS_CHART_COLORS`), so a status keeps its color on every chart.

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

### Don't:

- Don't replace the supplied artwork or Roboto, or expose tenant color customization beyond Central/Tenant IT.
- Don't use an unadjusted tenant primary in place of the readable action and action-label roles.
- Don't treat generated tonal previews as approved application colors.
- Don't introduce marketing claims or change task flows through visual refinement.
- Don't describe loaded-page filtering as a full-dataset search or let selection grant a new mutation permission.


## Foreground administration tasks

Owner-approved creation and review flows use the shared native AdministrationDialog. Keep the Axiom/Roboto palette, square actions, 12px panel radius and existing semantic inventories. The neutral dialog backdrop uses the documented dialog-backdrop color at 45% opacity in both modes.

Creation progresses through short named steps, explicit review and a saved result in the same dialog. Keep Back, Cancel and Next/Confirm in the visible footer. Native modal focus contains keyboard navigation; closing returns focus to the entry button. Long content scrolls inside the dialog. Use tenant-scoped searchable pickers instead of requiring UUID entry.

Validation stays beside the active step; mutation errors and results stay in the task. Close, backdrop dismissal, Escape and field edits are unavailable during pending or uncertain mutations. Retry preserves the exact body/key; a definitive conflict requires deliberate reload and renewed review. Normal filtering, sorting, pagination, export, copying and navigation keep their direct behavior. Do not turn every control into a dialog.


## Guidance on demand

Optional procedures belong in a help control beside the relevant heading, available on hover, keyboard focus and click/tap. Use the shared ContextHelp component, keep its popover within the viewport, and dismiss it with Escape. This is the system-wide principle for future work; this pass applies it to Tenant/Central IT and project administration. Keep required field labels, immediate validation, current status, permissions needed for a decision and consequential review evidence visible. Do not hide actionable errors or confirmation details as help.

Project administration uses the existing underline navigation for Admin & personnel, Companies, Survey and Project settings. Keep each workspace mounted while switching sections so a refresh does not discard command intent; native dialogs keep background navigation inert during active work. Wide personnel dialogs accommodate readable table columns. Names, emails, role labels and action buttons retain complete words; tables scroll horizontally when their content exceeds the available width instead of shrinking type. Request descriptions keep their deliberate wrapping treatment.

Help uses the existing compact supporting-text size of 0.875rem; its trigger retains a 44px target.


## Administration Headings and Choices

Use Title Case for static administration headings, workspace labels and table headings; preserve real names and record values. Workspaces read Admin & Personnel, Companies, Survey and Project Settings. Project Admin Access follows Invitations and Next Steps inside Project Admin Setup.

Operational role choice uses the shared native five-row scrollable single-selection list with readable names and a 44px row target. Keep keyboard arrow selection and visible scrolling. Tenant Company is a fixed designated home organization, so its company select is disabled; enable search/select/create under Previously Created Company. Home designation uses the foreground review contract and preserves the calling invitation. Roles & Permissions is a read-only reference.
