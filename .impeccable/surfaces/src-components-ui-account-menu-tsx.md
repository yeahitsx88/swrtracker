---
version: 1
slug: "src-components-ui-account-menu-tsx"
primary_target: "src/components/ui/account-menu.tsx"
related_targets: ["src/app/(projects)/layout.tsx", "src/components/ui/account-menu.css", "src/components/ui/product-brand.tsx"]
---

# Account shell refinement

Mode: Operate. Precisely specified, code-first incumbent extension from the owner's annotated comments, GitHub menu recording and explicit overlay approval (Decision 16). See docs/ACCOUNT_SHELL_BRIEF.md for the complete source contract and scope boundaries.

## Direction contract

THESIS: Familiar account wayfinding in a full-height right overlay, leaving the working page stationary and restoring it on dismissal.

OWN-WORLD: Inherit supplied Axiom artwork, Roboto, white surfaces, slate text, steel-blue structure and existing focus. No new tokens or raster assets.

STORY: Greet the authenticated account by name; reveal the familiar account destinations, preserving project context and per-browser-session sign-out.

FIRST VIEWPORT: Sticky header carries Axiom, Hello plus full name, and Menu at right. At every width, the native modal drawer overlays the header and working page from viewport top to bottom, meeting the right edge. Width caps at 320px with at least a 24px backdrop strip on small screens. A slate backdrop dims the unchanged page; scrollbar compensation prevents movement. Close, Escape and backdrop clicks dismiss; native focus protection returns to Menu without scrolling.

FORM: Precisely specified incumbent extension; no concept seed. Right-edge slide and coordinated backdrop: 260ms decelerating entrance, 180ms exit, interrupted/repeated opening without timers. CSS display/overlay support enhances native behavior; absent support still permits immediate dismissal. Reduced motion removes spatial travel. Long names wrap; loading/failure never invents identity and failure exposes retry.

Owner-approved scroll refinement: title and Close stay in a non-scrolling header while the account destinations scroll beneath it. The same shared popout frame keeps analytics Close controls visible at every content scroll position, without obscuring body controls or changing native modal behavior.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
