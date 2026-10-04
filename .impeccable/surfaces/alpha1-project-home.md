---
version: 1
slug: alpha1-project-home
primary_target: src/components/ui/project-home.tsx
related_targets: [src/components/ui/project-nav.tsx, src/components/ui/project-shell-header.tsx, src/components/ui/project-home.css, src/components/ui/project-workspace.css, src/components/ui/account-menu.tsx, src/components/ui/account-sign-out.tsx, src/components/ui/administration-records.tsx]
---

# Alpha 1 project workspace

Mode: Operate. Precisely specified code-led redesign from the supplied screenshot and detailed owner brief. The brief fixes the composition and explicitly preserves branding, semantic appearance and server authority; no concept tournament or new identity exercise applies.

THESIS: A persistent capability-aware sidebar makes authorized work discoverable; Home puts current scoped obligations, requests and dates in one compact workspace.

FIRST VIEWPORT: Existing Axiom brand/greeting header, a 224px sidebar with grouped destinations, project/role/state context and a named Home greeting with a visible UTC date. Project routes consolidate account destinations in the sidebar and suppress the top-right Menu, following the owner's subsequent steering. Pages outside the project workspace retain the right account overlay. Requester sees New Request, four summary counts and recent/status panels. Survey sees current workload and queue/distribution. Roles share one semantic token system. Personal modes and tenant colors are inherited, never replaced by the reference's navy palette.

FORM: Compact shared cards, semantic record tables and existing charts. Home panels are flat; the summary strip keeps tabular counts and explicit all-date/upcoming qualifiers. Compact record tools open on demand without hiding loaded-record scope. Request references and dates stay intact, status labels wrap inside their cell, and table gutters keep statuses separate from dates. The signature interaction is a summary/chart drill-down to the matching existing request view. Requester scope includes company requests already authorized to the account. Superintendent Area workload and explicit linked crews remain separate; independent administration respects existing analytics restrictions. Admin is additive to actual operational authority. No unsupported screenshot functionality.

MOBILE: Below 1000px, desktop navigation becomes a native left modal drawer with focus protection, fixed title/Close header and contained scrolling; its 340px cap leaves backdrop space on a 390px viewport. At 390px, two-column counts and a single content lane replace the desktop composition. Tables retain contained horizontal scroll and show their scroll hint only on actual overflow. Links, Close, record sort/action controls and Sign out retain 44px or larger targets. Account destinations use this same drawer on project routes; pages outside the project workspace retain their existing right account overlay.

QUALITY BAR: Readable light/dark/system/tenant-color states, current capability/state accuracy, real server-scoped data, no document overflow, usable direct routes, keyboard focus and dismissal. Preserve Alpha 1 tests and verify representative accounts against production HTTP/browser runtime in owned disposable state.

FINISH: Independent finish review and documentation use actual desktop/mobile captures in `.impeccable/review/alpha1-ui`. The current checkpoint records 688 browser/HTTP checks, 36 role/light/dark/1440/390 combinations, four system/custom-color/setup captures and three additional account-navigation captures (43 captures total). Actual Profile navigation and logout failure/retry are covered. The prior scoped badge/reference/date/gutter correction review was accepted at its captured scope. The fresh independent review opened all 43 valid captures and returned `ship` for the captured shell/Home and account-navigation consolidation, with no material UI fixes. This evidence does not approve every project surface or constitute exhaustive security/release approval. DESIGN.md, .impeccable/design.json and PRODUCT.md record the approved project-menu exception. The one detector run reported typography advisories and no primary findings; DESIGN.md now records the implemented Home type roles. No new raster assets are required.
