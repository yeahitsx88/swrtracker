---
version: 1
slug: administration-refinement
primary_target: src/components/ui/administration-workspace.tsx
related_targets: [src/app/(projects)/accounts/workspace.tsx, src/app/(projects)/projects/[projectId]/(admin)/admin/workspace.tsx, src/components/ui/project-administration.tsx, src/components/ui/project-member-wizard.tsx, src/components/ui/tenant-employee-creation.tsx, src/components/ui/project-templates.tsx, src/components/ui/administration-records.tsx]
---

# Tenant IT and Project Admin refinement

Mode: Operate. Restore owner-requested administration workflows within the approved Axiom workspace. This correction supersedes the earlier in-page navigation and paired Accounts/reviews composition. Existing fixed roles and authorization remain authoritative.

## Direction contract

THESIS: Restore discoverable, functioning employee/member/admin/company/template creation with separate task pages and explicit guided confirmation.

OWN-WORLD: Inherit Roboto, semantic Light/Dark surfaces, square 44px controls, flat shared cards and independent question-mark help. IT staff and project administrators work through long personnel inventories on office screens and phones; saved personal/device appearance remains authoritative.

STORY: Tenant IT creates employees, independent Project Admins and reusable templates, and reviews account evidence separately. Project Admin creates employees or adds eligible existing members, registers companies and manages the project's scoped settings while operational and independent administration remain distinct.

FIRST VIEWPORT: Keep the persistent left workspace and padded full-width content. A page heading with adjacent help precedes wrapping route links with a marked current page. Only its task area appears. Creation actions precede inventories; a three-step Person/Access/Review or Template/Structure/Review wizard exposes the actual operation. Role options use readable title case and native scrolling.

FORM: Code-led extension; no concept seed because the user pins the deployed composition. The signature interaction is navigation between sibling task pages without discarding input or the exact frozen command, while uncertain commands block competing actions. Archived creation remains restricted with its read-only explanation visible.

FINISH: Complete independent review and documentation from actual source/captures. Preserve incumbent DESIGN.md/sidecar for this ordinary extension; report pre-existing drift without repair. No new shipping raster assets are required.

## Preserved contract

Keep current eligibility and closed/setup checks, explicit consent, reason, blocker evidence, notices, errors and frozen body/key retry behavior. The authorized authenticated employee endpoint reuses Identity creation and coordinates Tenancy membership/independent grants plus Audit evidence; invitation/config/template handlers add optional exact retry support. Fresh current authorization and writable/preparing checks precede recorded replay; no migrations or public registration expansion. Supplemental introductions move to independent adjacent help; destructive scope and confirmation facts stay inline. Tenant IT navigation follows server administration inventory/capabilities and never grants project request access. Newly owned synthetic fixtures only; preserve live demo data/settings. Register source, checkpoints and exact-source evidence in docs/design/alpha1.

## Current Route and Command Contract

Tenant Accounts (`/accounts`), Central IT Reviews (`/accounts/reviews`) and Project Templates (`/accounts/templates`) are separate full-width task pages. Project Administration separates Personnel (`/admin`), Project Admins (`/admin/administrators`), Companies (`/admin/companies`), Settings (`/admin/settings`), Request Policy (`/admin/request-policy`), Access and Recovery (`/admin/access-recovery`) and Diagnostics (`/admin/diagnostics`) under its project route. Shared layouts keep editors mounted; only the current task area is visible. Wrapping route links expose current-page state.

One owner per workspace coordinates all sibling mutations, including policy, invitations, recovery and protected handover. Pending/uncertain/stale commands retain their exact body/key and block competing actions in both directions. Sibling route navigation preserves input; leaving a held workspace invokes the progress guard. Each definitive 409 requires deliberate reload and renewed consent. Shared load/error/success notices remain outside hidden task areas and visible on originating and sibling pages. Archived creation remains restricted; approved access removal remains available. See [the restoration record](../../docs/design/alpha1/administration-restoration.md) for every tab, source ownership and executable fixture boundaries.

## Finish Handoffs

The prior increment's 18-capture ship verdict is historical and does not verify this restoration. The fresh full review found two material defects: competing sibling owners and task notices hidden on Personnel. Implementation checkpoints `eb84572`, `645ebeb` and `66b66ad` restore the workflows and correct those issues. Current-source executable gates pass: strict/unused types, 566 unit tests/build, 28 PostgreSQL suites, 33 restoration HTTP, 52 existing HTTP, 24 existing lifecycle browser, 26 lost-response browser, 55/55 named cases and 156 restoration browser checks with 54 captures. The same reviewer scored both corrections resolved and returned ship limited to those two fixes, individually validating all 54 raw captures. This does not claim new full-surface clearance or release approval. Retained-demo image refresh and matching before/after read-only preservation digests passed; the actual in-app browser confirmed separated tabs and guided member creation.

Documenter comparison preserves DESIGN.md and `.impeccable/design.json`; it reports their pre-existing administration page-hierarchy prose and details/summary preview drift without repair. The central [design hub](../../docs/design/alpha1/README.md) pins complete source history through `66b66ad` and separates the later documentation/evidence refresh.
