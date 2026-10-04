---
version: 1
slug: administration-refinement
primary_target: src/components/ui/administration-workspace.tsx
related_targets: [src/app/(projects)/accounts/page.tsx, src/app/(projects)/projects/[projectId]/(admin)/admin/page.tsx, src/components/ui/project-administration.tsx, src/components/ui/project-creation.tsx, src/components/ui/administration-records.tsx]
---

# Tenant IT and Project Admin refinement

Mode: Operate. Extend the owner-approved Axiom workspace, heading/help and record treatment into existing administrative screens. No new identity, permissions or command lifecycle.

## Direction contract

THESIS: Make the existing administrative tasks easy to find and inspect through named sections and contained records; avoid an undifferentiated stack of nested forms.

OWN-WORLD: Inherit Roboto, semantic Light/Dark surfaces, square 44px controls, flat shared cards and independent question-mark help. IT staff and project administrators work through long personnel inventories on office screens and phones; saved personal/device appearance remains authoritative.

STORY: Tenant IT finds accounts and durable Central IT reviews, opens exact evidence and separately confirms each scope. Project Admin finds personnel, companies, settings, access/recovery and diagnostics while operational and independent administration remain distinct.

FIRST VIEWPORT: Keep the persistent left workspace. A page heading with adjacent scope help precedes a wrapping in-page section navigator. Tenant accounts and reviews use a shared two-column desktop work area and one lane on phones. Project administration groups existing full-width personnel/company inventories and lighter settings sections. Selection controls precede bounded record viewports; existing command confirmations remain visible in their current flow.

FORM: Code-led extension of existing pages and components. No concept seed: the user pins the newly deployed composition. The signature interaction is a section link leading to its current controls without unmounting editors or discarding state; record actions stay readable inside table overflow.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Preserved contract

Keep the original API calls, current eligibility and closed/setup checks, explicit consent, reason, blocker evidence, notices, errors and frozen body/key retry behavior. Supplemental introductions move to independent adjacent help; destructive scope and confirmation facts stay inline. Tenant IT navigation follows existing server administration inventory/capabilities and never grants project request access. Newly owned synthetic fixtures only; preserve live demo data/settings. Register source, checkpoints and exact-source evidence in docs/design/alpha1.
