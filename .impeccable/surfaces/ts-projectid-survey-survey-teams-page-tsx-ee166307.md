---
version: 1
slug: "ts-projectid-survey-survey-teams-page-tsx-ee166307"
primary_target: "src/app/(projects)/projects/[projectId]/(survey)/survey/teams/page.tsx"
related_targets: ["src/components/ui/team-management.tsx","src/components/ui/team-management.css"]
---

# Team Management

Mode: Operate. The Survey Manager manages existing project personnel and named organizational teams. Inherit Axiom and the current compact operational workspace. Build directly in code. No account invitations, inferred authority, ticket reassignment or historical data changes.

## Direction contract

THESIS: Find a person, change a fixed role deliberately, or maintain a named team without confusing membership with operational authority. Refuse the long all-personnel dashboard.

OWN-WORLD: Existing white/slate/steel-blue Axiom surfaces, Roboto, compact native fields and visible keyboard focus. Preserve DESIGN.md tokens and supplied brand assets.

STORY: Search project personnel, see role and team availability, confirm consequential changes; switch to Teams to inspect or edit name, Area, member lead and selected members.

FIRST VIEWPORT: Heading and scope explanation above Personnel/Teams tabs; search and page-size controls above compact identity/role/team rows. Create team is the Teams primary action. An inline editor replaces the list rather than extending its scroll. Signature interaction: selected members persist across bounded search pages, while the lead must stay selected. No decorative motion.

FORM: Precisely specified narrow operational flow; no concept seed required. Lists and inline confirmation forms use familiar task controls, stacking identity and assignment on mobile.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Protected staffing extension — 2026-09-30

The Personnel row exposes Staffing for current Party Chiefs in Full/Medium builds. The inline editor replaces the list. Its first viewport names the Chief and separates current explicit Area/reporting evidence from proposed changes; the roster and bounded Area/personnel searches open on demand. Instrument Man selections persist across search pages and are additions, never a replacement roster. Superintendent selection changes the explicit reporting link; named teams never infer it. Existing cross-Area assignments are not silently reassigned. Archived projects expose read-only evidence. A server-issued snapshot and stable retry key protect saves; stale state requires deliberate reload, never automatic rebase. No Sabine staffing writes, historical ticket changes or obligation cleanup are part of this extension. Inherit the six direction blocks above; no new identity, comp or raster assets.
