---
name: SWRTracker
description: Axiom Civil Services visual foundation for the existing field survey support interface.
colors:
  brand: "#4682b4"
  action: "#315f85"
  accent: "#ffa500"
  ink: "#2e2e2e"
  muted: "#58636e"
  bg: "#f5f7f9"
  bg-elevated: "#ffffff"
  line: "#d8dfe5"
  danger: "#b23833"
typography:
  title:
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
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.bg-elevated}"
    rounded: "{rounded.button}"
    padding: "0.55rem 0.8rem"
  button-secondary:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0.55rem 0.8rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.bg-elevated}"
    rounded: "{rounded.button}"
    padding: "0.55rem 0.8rem"
  input:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.control}"
    padding: "0.62rem 0.7rem"
  navigation-link:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.muted}"
    rounded: "{rounded.navigation}"
    padding: "0.45rem 0.75rem"
  status-badge:
    rounded: "{rounded.pill}"
    padding: "0.2rem 0.55rem"
  ticket-card:
    backgroundColor: "{colors.bg-elevated}"
    rounded: "{rounded.ticket}"
    padding: "0.7rem"
---

# Design System: SWRTracker

## Overview

**Creative North Star: "Axiom Civil Services"**

The pinned visual authority is the Axiom Civil Services Brand Guide, version 1.0, September 2026, supplied at `D:/Programming/_references/Axiom Brand/Axiom_Civil_Services_2026_Brand_Guide.pdf`. Future UI work must follow that identity. This document records the implemented shared foundation; it does not create a replacement identity or introduce product claims.

White dominates the interface, with slate text, steel blue structure, restrained orange attention, and Roboto throughout. Existing task flows retain their content and behavior. This is a scan of `src/app/globals.css`, `src/components/ui/product-brand.tsx`, and the authentication and projects layouts, not a claim that every screen has been visually audited.

**Key Characteristics:**

- White surfaces and slate text.
- Steel blue structure and darker blue actions.
- Supplied Axiom artwork and self-hosted Roboto.
- Compact task controls with visible keyboard focus.

## Colors

The palette follows the supplied Axiom identity; operational state colors supplement it only where their meaning is explicit.

### Primary

- **Steel Blue** (`brand`): structural accents, selected outlines, and the header rule.
- **Action Blue** (`action`): darker interface tone for white button labels, active navigation text, caret, and focus indicators. It supports AA contrast for small labels on white.

### Secondary

- **Orange** (`accent`): reserved for limited attention. Its availability does not require decorative use on each screen.

### Neutral

- **Slate** (`ink`): primary text.
- **Muted Slate** (`muted`): secondary copy and field labels.
- **Cool Background** (`bg`): page canvas.
- **White** (`bg-elevated`): panels, navigation, controls, and primary action labels.
- **Divider** (`line`): quiet panel and navigation boundaries.

Error, warning, success, and neutral badges retain their implemented foreground/background/border combinations in the global stylesheet. Use their text labels to convey state; color is supplementary. `danger` is the destructive button fill. Generated tonal strips in the sidecar are preview aids, not additional approved application tokens.

**The Brand Authority Rule.** Preserve the pinned Axiom palette and artwork when extending the interface.

## Typography

Roboto is the display and body family with a generic sans-serif fallback. The normal variable face covers weights 100–900 and uses `font-display: swap`. It is served from `public/fonts/roboto-variable.ttf`, sourced from [Google Fonts Roboto](https://github.com/google/fonts/tree/main/ofl/roboto); retain `public/fonts/OFL.txt` with redistribution.

Titles use bold weight and tight tracking; their sizes remain appropriate to the actual heading level rather than a newly invented display scale. Body copy uses the body role; labels use the label role, and inputs use the field role. Buttons use weight 700. Product identity uses a 1.125rem, weight-700 label. Badges and steps use 0.74rem text, while navigation uses 0.875rem.

## Layout

The shell is a sticky white header (Axiom wordmark, greeting, account Menu) above a sticky white **project band**: project name, the viewer's project role, and the project section tabs. Content shares a centered container capped at 1280px (`--shell-max`) with a 1rem gutter, 1.25rem from 760px. Forms and long text use a 760px reading width (`.form-narrow`); text fields cap at 40rem and date/number fields at 18rem. Panels have 1.25rem padding, 1.5rem from 760px and 1rem at 600px and below. Rows wrap; panels allow their contents to shrink with `min-width: 0`.

Below 760px the section tabs become a fixed **bottom tab bar** (icon plus label, 60px targets, safe-area aware) and top-level panels run edge to edge. At 600px and below the header shows the supplied Axiom icon instead of the wordmark, and the greeting truncates on one line.

Request lists render as cards on phones and as table rows (Number, Request, Type, Need-By, Status) from 900px, from the same markup. The request detail page uses a main column plus a sticky Actions panel from 1100px; below that, Actions follow the request details. Account navigation remains the approved right-side overlay (Decision 16).

Authentication uses a centered shell capped at 460px with centered branding and a full-width primary action. Preserve the existing route structure and role-specific navigation.

## Elevation & Depth

Panels are white with a thin divider border and one quiet shadow token (`--shadow-panel`). Interactive cards lift with `--shadow-raised` and a Steel Blue border on hover. Nested panels have no shadow. The header's sticky positioning and three-pixel Steel Blue top rule provide structure without ornamental depth.

## Shapes

Buttons and visually button-like navigation use square corners. Inputs and banners retain the 10px control radius. Ticket cards and panels have their own slightly larger corners. Status badges and steps are pills. Maintain these functional distinctions rather than assigning one radius everywhere.

## Components

### Buttons

Primary actions use Action Blue; secondary actions use white with a divider border and slate text; destructive actions use the danger fill. All have a minimum height of 44px, weight 700, and the documented control padding. Hover fills are `#264a68`, `#edf3f8`, and `#8f2b27` respectively. Disabled buttons have opacity 0.45 and a not-allowed cursor. Color transitions take 150ms with `ease`; reduced-motion preference removes the transition.

The owner approved straight-edged buttons on 2026-10-01. The shared button-radius token is zero; general structural containers retain their existing rounding.

### Inputs / Fields

Inputs, selects, and textareas are white with a one-pixel `#81909d` border and the field type role. Labels sit above with a 0.35rem gap. Textareas start at 100px height and resize vertically. Placeholders retain the muted text color at full opacity.

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

Focusable elements use a three-pixel solid Action Blue outline offset by three pixels. Retain this indicator across buttons, links, fields, and navigation; never remove it without an equally visible replacement.

### Axiom Brand Lockup

`ProductBrand` combines the supplied artwork with the SWRTracker name. `public/brand/axiom-wordmark.png` is the unchanged `2026 Typography.png` source; `axiom-icon.png` is the unchanged `2026 Icon.png`. Both source canvases are 1600 × 1280. Provenance is retained in `public/brand/README.md`.

Do not redraw, recolor, stretch, or add effects. Preserve at least the A cap-height of clear space. The implementation trims only excess transparent canvas through its viewport: the application header frame is 168 × 56px with the source image rendered 132px wide, and the authentication frame is 200 × 80px with the image 160px wide. At 600px and below the application header shows the unchanged `axiom-icon.png` canvas at 52px wide in a 44px frame instead of the wordmark. Keep image proportions and visible clear space when changing the layout; frame dimensions alone are not a substitute for checking the artwork.

## Do's and Don'ts

### Do:

- Do follow the Axiom Civil Services Brand Guide v1.0, September 2026, for future UI work.
- Do keep white dominant, slate readable, steel blue structural, and orange limited to attention.
- Do preserve the supplied logo, its proportions, and at least A cap-height clear space.
- Do retain self-hosted Roboto and its OFL license.
- Do retain visible keyboard focus, reduced-motion support, and readable state labels.

### Don't:

- Don't substitute a new brand palette, font pairing, or invented logo.
- Don't use Steel Blue in place of Action Blue for small white button labels.
- Don't treat generated tonal previews as approved application colors.
- Don't introduce marketing claims or change task flows through visual refinement.
