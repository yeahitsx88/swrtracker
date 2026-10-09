# Shared design audit and reference-led refinement

2026-10-04 · `alpha1-ui-redesign` · parent `9b76081`

## Scope and authority

The owner requested a design-code audit, rounded blue filled/outlined action buttons from references 1–2, recognizable stroke icons from reference 3, and softer surfaces/metric accents from reference 4 while preserving layouts. This supersedes the earlier square-button approval. Reviewed shared CSS, theme application, icon/navigation components, Project Administration and Home. This is a focused technical/design audit, not a complete WCAG certification or measured performance audit of every route.

## Findings and disposition

| Priority | Finding and impact | Resolution |
| --- | --- | --- |
| P2 | `appearance-theme.tsx` chose foreground using a threshold for pure black although the actual dark text is `#111820`. Custom yellow could fail 4.5:1 text contrast (WCAG 1.4.3). | Compare actual foreground contrasts; verify custom yellow, black, white and magenta in both themes, at rest and hover. |
| P2 | Theme application set hover equal to resting action color, removing mouse feedback. | Derive a distinct hover shade in the direction that preserves text contrast. |
| P2 | Home long request references could paint into the Details column at narrow widths, obscuring adjacent content. | Constrain the existing reference cell and ellipsize its link; full accessible name and destination remain. |
| P3 | A shell-wide button-radius rule overrode semantic controls and prevented the requested treatment. | Shared 6px action-button radius, scoped rules, 16px panels; disclosure and sort controls retain their lightweight affordances. |
| P3 | Generic settings/list icons represented unrelated destinations, weakening recognition. | Explicit Personnel, Companies, Settings, Recovery and Diagnostics icons; distinct Profile, Appearance, Assignments, Tenant Accounts, Templates, Custom Roles and Help Desk icons. Visible labels remain. |
| P3 | Disabled buttons used global opacity and inherited some hover styles. | Muted opaque disabled surface/text, no enabled-only hover behavior; dark destructive controls respect disabled styling. |

Defaults use `#0b4bb3` blue, while explicitly saved tenant colors remain authoritative. Secondary controls use the muted text and strong boundary tokens. Home accents use existing action/warning/success hues, with existing counts and charts. No new data, business capabilities, navigation destinations or page grids were introduced.

## Scoped quality assessment

Rubric 0–4 per dimension: accessibility 3, performance 3, theming 3, responsive 3, implementation integrity 3: **15/20** after correction. Performance score reflects static implementation only: no new dependency, network request, image asset or animation; no Lighthouse/Core Web Vitals measurement was performed. Maximum scores are withheld because this review does not cover every route, assistive technology or theme combination.

Positive foundations retained: semantic HTML buttons/links, decorative SVG icons beside text, native protected-focus dialogs, reduced-motion support, token-based surfaces,44px principal actions, and existing responsive navigation. The company preview closes by Escape without submitting a mutation.

## Verification and remaining work

Baseline/final strict TypeScript including unused checks passed. Pinned Node 22.23.3 / pnpm 11.19.0 image: 584 unit tests, production build passed. Final browser runner passes 29 assertions across 1107px/1440px desktop and 390px phone, Light/Dark, four extreme custom colors, rest/hover contrast, keyboard focus, review modal/Escape and page overflow. Six settled captures were inspected. Tests use a separate synthetic fixture; no retained demo records or preferences were changed.

The detector ran once and reported 58 advisories: 48 color-token matches, five side accents, two font sizes, one radius, one font-family and one accent/radius combination. These are heuristics, not 58 confirmed defects. Default action/radius changes are newly authorized; theme fallbacks, status accents and existing structural values explain the remainder. Existing duplicated dark fallback rules and hardcoded status colors are P3 maintenance debt; consolidate during a dedicated theme pass rather than changing status semantics here. Existing data tables intentionally scroll horizontally inside their containers at phone widths. No further layout redesign is proposed.

Recommended follow-up: `$impeccable harden` for dedicated theme-token consolidation, followed by `$impeccable polish`. These are optional future work; requested shared visual changes are implemented.
