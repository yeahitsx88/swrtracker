---
version: 1
slug: "s-projects-projectid-request-new-page-tsx-d71784d2"
primary_target: "src/app/(projects)/projects/[projectId]/request/new/page.tsx"
related_targets: ["src/app/(projects)/projects/[projectId]/(requester)/tickets/[ticketId]/page.tsx","src/app/(projects)/projects/[projectId]/(requester)/drafts/page.tsx","src/app/(projects)/projects/[projectId]/(admin)/admin/draft-recovery.tsx"]
---

# Requester progress and draft recovery

Mode: Operate. Extend the existing requester wizard, detail, draft list and IT project administration; do not replace their visual world.

Owner approvals: true partial drafts with required intake validation at Submit; requester soft-delete and project-scoped PROJECT_ADMIN recovery within 30 days with a reason. No automatic expiry or permanent attachment purge. Preserve identity, submitted records, current operational roles and Axiom branding.

## Direction contract

THESIS: Make saved progress and the next safe action explicit; refuse silent submission of unsaved edits or destructive cleanup disguised as housekeeping.

OWN-WORLD: Inherit DESIGN.md's Axiom blue, white panels, existing type, restrained borders, native form controls and compact navigation. No new identity, illustration or animation system.

STORY: Requesters can save incomplete intake, resume the same draft, retain failed file selections and correct returned work before submitting. Project administrators explicitly review a deleted draft and supply a recovery reason.

FIRST VIEWPORT: Keep the authenticated shell and six-step wizard. Save Draft is available beside the current step's navigation; status and failures sit above the form. Draft rows lead with description and Resume. Recovery lives in an on-demand admin panel, not an operational request list.

FORM: Precisely scoped local extension; no concept seed required. Code-led implementation follows the owner's existing build-directly approval. Signature interaction: uncertain writes retain the exact retry command and block conflicting edits; stale writes require deliberate reload. Motion remains incumbent and respects reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Implementation note: this contract was recorded after the initial edits, correcting a missed pre-code documentation step. It describes inherited scope, not a new approval or retroactive compliance claim.

Finish record: fresh read-only finish reviewer disposition ship after all15 confirmation captures at1440/810/390 and incumbent810/390. Fresh read-only documenter accepts the ordinary Axiom extension; DESIGN.md and its sidecar remain unchanged. No shipping raster is added. Reported, unrepaired documentary differences: reversible Delete Draft uses the existing secondary control despite the general destructive-danger guidance; inherited greeting/drawer-motion/pinned-header behavior remains incompletely covered in DESIGN/sidecar. This is scoped requester/recovery approval, not whole-product certification.
