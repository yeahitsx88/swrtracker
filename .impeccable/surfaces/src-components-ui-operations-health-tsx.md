---
version: 1
slug: "src-components-ui-operations-health-tsx"
primary_target: "src/components/ui/operations-health.tsx"
related_targets: []
---

# KPI pop-out extension

Mode: Operate. Extend existing OperationsHealth, preserving Axiom, the native dialog, current queues and role-specific destinations. Owner explicitly requested five reusable chart types and applicable filters; code-first is the recorded preference.

## Direction contract

THESIS: One measure, one authorized population, several useful views; no miniature report builder or repeated request dataset downloads.

OWN-WORLD: Existing white/slate/steel-blue Axiom controls, Roboto and visible focus. Inherit DESIGN.md rather than create a new visual identity.

STORY: Open a measure, choose a chart, narrow a date or operational dimension, understand coverage, then inspect bounded matching requests.

FIRST VIEWPORT: Existing dialog heading/Close at top; compact visualization/group controls, current scope sentence, then a legible chart. Secondary filters and source coverage use native disclosures. On mobile controls stack without page overflow. Signature interaction: switch presentation without refetching the same aggregates; apply filters to update every chart consistently. No decorative motion.

FORM: Precise local extension, not a concept tournament; no seed required. Heat map, bar, trend, donut and completed-share gauge use a common typed result. Mean hours are not additive: no donut or arbitrary SLA gauge for turnaround.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Approved Superintendent population extension

Decision 14 keeps the same Operate world. The native Workload view select distinguishes Area-wide workload (including unassigned and unlinked crews) from Linked-crew KPIs (explicit reporting links intersected with authorized Areas). Scope copy stays visible beside each aggregate, and the request drill-down carries the same cohort. Changing views clears personnel filters, preserves common filters and hides stale details. Queue-health tiles remain explicitly Area-wide. The Superintendent Overview reuses its initial snapshot, not the Manager-only activity endpoint. No new tokens, imagery, motion or authority grants.
