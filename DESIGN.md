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
  navigation: "6px"
  control: "10px"
  ticket: "12px"
  panel: "14px"
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
    rounded: "{rounded.control}"
    padding: "0.55rem 0.8rem"
  button-secondary:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.8rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.bg-elevated}"
    rounded: "{rounded.control}"
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

Main content and header share a centered container capped at 1120px. The base main padding is 1rem, increasing to 1.2rem at 760px. Page groups use the page-gap token; panels use the panel-gap token internally. Panels have 1.25rem padding by default, 1.5rem at 760px and above, and 1rem at 600px and below. Rows wrap; panels allow their contents to shrink with `min-width: 0`.

Authentication uses a centered shell capped at 520px with 2rem vertical padding and centered branding. The projects header stays at the top. At 600px and below its identity and actions wrap, and navigation links wrap; from 601px through 759px the link row can scroll horizontally, and from 760px it wraps. Preserve the existing route structure and role-specific navigation.

## Elevation & Depth

Shared panels and cards use white fill and thin boundaries on the cool canvas. No shared shadow vocabulary is defined; nested panels explicitly have no shadow. The header's sticky positioning and three-pixel steel blue top rule provide structure without ornamental depth.

## Shapes

Controls and banners use the control radius; navigation uses the smaller navigation radius. Ticket cards and panels have their own slightly larger corners. Status badges and steps are pills. Maintain these functional distinctions rather than assigning one radius everywhere.

## Components

### Buttons

Primary actions use Action Blue; secondary actions use white with a divider border and slate text; destructive actions use the danger fill. All have a minimum height of 44px, weight 700, and the documented control padding. Hover fills are `#264a68`, `#edf3f8`, and `#8f2b27` respectively. Disabled buttons have opacity 0.45 and a not-allowed cursor. Color transitions take 150ms with `ease`; reduced-motion preference removes the transition.

### Inputs / Fields

Inputs, selects, and textareas are white with a one-pixel `#81909d` border and the field type role. Labels sit above with a 0.35rem gap. Textareas start at 100px height and resize vertically. Placeholders retain the muted text color at full opacity.

### Navigation

Links have a minimum height of 44px. Active links use an Action Blue label, Steel Blue border, pale blue fill, and weight 700. Hover uses the same pale fill and steel border. Keep the projects skip link, which becomes visible on focus and targets the main content.

### Chips / Cards

Status badges carry readable labels and semantic colors. Step chips use muted labels at rest and the active navigation colors for the current step. Ticket cards use a thin divider border, white fill, compact padding, and a 0.45rem internal grid gap; linked cards highlight with the navigation hover colors.

### Operations workspace

Queue health uses five clickable measures and a native details dialog, with a blue count heat map carrying numeric labels. Work queues use keyboard-navigable tabs, labeled filters, selectable page sizes, and native disclosure rows. Collapsed descriptions are ellipsized; expanded rows retain full descriptions and workflow controls. Metric values use 1.8rem tabular numerals; section headings use 1.25rem, summary rows 0.9rem, metric labels 0.875rem, and detail links 0.75rem. These are compact data-display roles, not a replacement type system. Overdue measures reuse the existing warning badge colors. Controls retain the 10px radius; tabs use a square bottom selection rule.

### Keyboard Focus

Focusable elements use a three-pixel solid Action Blue outline offset by three pixels. Retain this indicator across buttons, links, fields, and navigation; never remove it without an equally visible replacement.

### Axiom Brand Lockup

`ProductBrand` combines the supplied artwork with the SWRTracker name. `public/brand/axiom-wordmark.png` is the unchanged `2026 Typography.png` source; `axiom-icon.png` is the unchanged `2026 Icon.png`. Both source canvases are 1600 × 1280. Provenance is retained in `public/brand/README.md`.

Do not redraw, recolor, stretch, or add effects. Preserve at least the A cap-height of clear space. The implementation trims only excess transparent canvas through its viewport: the desktop frame is 184 × 80px with the source image rendered 144px wide, and the small-screen frame is 152 × 72px with the image 112px wide. Keep image proportions and visible clear space when changing the layout; frame dimensions alone are not a substitute for checking the artwork.

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
