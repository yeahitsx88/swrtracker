# Complete Alpha 1 Design File Index

[Return to the reference hub](README.md). The [manifest](changes.json) records exact Git blobs and commits.

Inventory: **116 files**, **18 commits**, base `b8ff81494c6701bb7f84550b40c247f4588b28cb`, design checkpoint `66b66ad0f57475e06cdb36b614e16e0d354612b2`. `A` means added and `M` modified.

Links show the current checkout; Git blob IDs pin the indexed versions. Documentation/evidence prepared after the checkpoint is listed separately below. The restoration includes authenticated administrative APIs and Tenancy/Audit coordination; Identity account creation is reused. There are no migration or dependency changes.

## Administrative application and audit coordination

| Change | File |
| --- | --- |
| M | [src/modules/audit/infrastructure/administrative-event.repository.ts](<../../../src/modules/audit/infrastructure/administrative-event.repository.ts>) |
| A | [src/modules/tenancy/application/create-project-employee.ts](<../../../src/modules/tenancy/application/create-project-employee.ts>) |

## Application pages and appearance

| Change | File |
| --- | --- |
| M | [src/app/(auth)/login/page.tsx](<../../../src/app/(auth)/login/page.tsx>) |
| A | [src/app/(projects)/accounts/layout.tsx](<../../../src/app/(projects)/accounts/layout.tsx>) |
| M | [src/app/(projects)/accounts/page.tsx](<../../../src/app/(projects)/accounts/page.tsx>) |
| A | [src/app/(projects)/accounts/reviews/page.tsx](<../../../src/app/(projects)/accounts/reviews/page.tsx>) |
| A | [src/app/(projects)/accounts/templates/page.tsx](<../../../src/app/(projects)/accounts/templates/page.tsx>) |
| A | [src/app/(projects)/accounts/workspace.tsx](<../../../src/app/(projects)/accounts/workspace.tsx>) |
| M | [src/app/(projects)/appearance/page.tsx](<../../../src/app/(projects)/appearance/page.tsx>) |
| A | [src/app/(projects)/projects/[projectId]/(admin)/admin/access-recovery/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/access-recovery/page.tsx>) |
| A | [src/app/(projects)/projects/[projectId]/(admin)/admin/administrators/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/administrators/page.tsx>) |
| A | [src/app/(projects)/projects/[projectId]/(admin)/admin/companies/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/companies/page.tsx>) |
| A | [src/app/(projects)/projects/[projectId]/(admin)/admin/diagnostics/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/diagnostics/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(admin)/admin/draft-recovery.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/draft-recovery.tsx>) |
| A | [src/app/(projects)/projects/[projectId]/(admin)/admin/layout.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/layout.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(admin)/admin/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/page.tsx>) |
| A | [src/app/(projects)/projects/[projectId]/(admin)/admin/request-policy/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/request-policy/page.tsx>) |
| A | [src/app/(projects)/projects/[projectId]/(admin)/admin/settings/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/settings/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(admin)/admin/subcontractor-access.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/subcontractor-access.tsx>) |
| A | [src/app/(projects)/projects/[projectId]/(admin)/admin/workspace.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/workspace.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(crew)/crew/work/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(crew)/crew/work/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(requester)/my-requests/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(requester)/my-requests/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(requester)/tickets/[ticketId]/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(requester)/tickets/[ticketId]/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(survey)/survey/operations/operations.css](<../../../src/app/(projects)/projects/[projectId]/(survey)/survey/operations/operations.css>) |
| A | [src/app/(projects)/projects/[projectId]/home/page.tsx](<../../../src/app/(projects)/projects/[projectId]/home/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/layout.tsx](<../../../src/app/(projects)/projects/[projectId]/layout.tsx>) |
| M | [src/app/(projects)/projects/page.tsx](<../../../src/app/(projects)/projects/page.tsx>) |
| M | [src/app/appearance.css](<../../../src/app/appearance.css>) |
| M | [src/app/globals.css](<../../../src/app/globals.css>) |

## Authenticated administrative HTTP adapters

| Change | File |
| --- | --- |
| M | [src/app/api/project-templates/handler.ts](<../../../src/app/api/project-templates/handler.ts>) |
| A | [src/app/api/projects/[projectId]/employees/route.ts](<../../../src/app/api/projects/[projectId]/employees/route.ts>) |
| M | [src/app/api/projects/[projectId]/invites/route.ts](<../../../src/app/api/projects/[projectId]/invites/route.ts>) |
| M | [src/app/api/projects/[projectId]/request-config/handler.ts](<../../../src/app/api/projects/[projectId]/request-config/handler.ts>) |

## Design contracts and implementation documentation

| Change | File |
| --- | --- |
| M | [.impeccable/design.json](<../../../.impeccable/design.json>) |
| A | [.impeccable/surfaces/administration-refinement.md](<../../../.impeccable/surfaces/administration-refinement.md>) |
| A | [.impeccable/surfaces/alpha1-project-home.md](<../../../.impeccable/surfaces/alpha1-project-home.md>) |
| A | [.impeccable/surfaces/survey-viewer-refinement.md](<../../../.impeccable/surfaces/survey-viewer-refinement.md>) |
| M | [DESIGN.md](<../../../DESIGN.md>) |
| M | [PRODUCT.md](<../../../PRODUCT.md>) |
| A | [docs/ALPHA1_UI_REDESIGN.md](<../../../docs/ALPHA1_UI_REDESIGN.md>) |
| M | [docs/CODEX.md](<../../../docs/CODEX.md>) |
| M | [docs/README.md](<../../../docs/README.md>) |
| A | [docs/design/alpha1/README.md](<../../../docs/design/alpha1/README.md>) |
| A | [docs/design/alpha1/administration-restoration.md](<../../../docs/design/alpha1/administration-restoration.md>) |
| A | [docs/design/alpha1/administration.md](<../../../docs/design/alpha1/administration.md>) |
| A | [docs/design/alpha1/changes.json](<../../../docs/design/alpha1/changes.json>) |
| A | [docs/design/alpha1/files.md](<../../../docs/design/alpha1/files.md>) |

## Lifecycle writer inventory

| Change | File |
| --- | --- |
| M | [audits/phase5-lifecycle-writers.json](<../../../audits/phase5-lifecycle-writers.json>) |

## Local evidence ignore rule

| Change | File |
| --- | --- |
| M | [.gitignore](<../../../.gitignore>) |

## Presentation data and filter helpers

| Change | File |
| --- | --- |
| A | [src/lib/heading-case.ts](<../../../src/lib/heading-case.ts>) |
| A | [src/lib/home-request-filters.ts](<../../../src/lib/home-request-filters.ts>) |
| A | [src/lib/project-home-data.ts](<../../../src/lib/project-home-data.ts>) |
| A | [src/lib/use-administration-progress.ts](<../../../src/lib/use-administration-progress.ts>) |

## Request, crew and review components

| Change | File |
| --- | --- |
| M | [src/components/tickets/attachment-list.tsx](<../../../src/components/tickets/attachment-list.tsx>) |
| M | [src/components/tickets/crew-work-actions.tsx](<../../../src/components/tickets/crew-work-actions.tsx>) |
| M | [src/components/tickets/project-review.tsx](<../../../src/components/tickets/project-review.tsx>) |
| M | [src/components/tickets/review-chart-lane.tsx](<../../../src/components/tickets/review-chart-lane.tsx>) |
| M | [src/components/tickets/ticket-history.tsx](<../../../src/components/tickets/ticket-history.tsx>) |
| M | [src/components/tickets/ticket-list.tsx](<../../../src/components/tickets/ticket-list.tsx>) |

## Sanitized verification evidence

| Change | File |
| --- | --- |
| A | [audits/alpha1-ui-redesign/administration-evidence.json](<../../../audits/alpha1-ui-redesign/administration-evidence.json>) |
| A | [audits/alpha1-ui-redesign/annotations-evidence.json](<../../../audits/alpha1-ui-redesign/annotations-evidence.json>) |
| A | [audits/alpha1-ui-redesign/evidence.json](<../../../audits/alpha1-ui-redesign/evidence.json>) |
| A | [audits/alpha1-ui-redesign/heading-help-evidence.json](<../../../audits/alpha1-ui-redesign/heading-help-evidence.json>) |
| A | [audits/alpha1-ui-redesign/survey-viewer-evidence.json](<../../../audits/alpha1-ui-redesign/survey-viewer-evidence.json>) |

## Shared workspace and UI components

| Change | File |
| --- | --- |
| M | [src/components/ui/account-details.tsx](<../../../src/components/ui/account-details.tsx>) |
| M | [src/components/ui/account-menu.tsx](<../../../src/components/ui/account-menu.tsx>) |
| M | [src/components/ui/account-navigation.ts](<../../../src/components/ui/account-navigation.ts>) |
| A | [src/components/ui/account-sign-out.tsx](<../../../src/components/ui/account-sign-out.tsx>) |
| M | [src/components/ui/administration-batch.tsx](<../../../src/components/ui/administration-batch.tsx>) |
| M | [src/components/ui/administration-records.css](<../../../src/components/ui/administration-records.css>) |
| M | [src/components/ui/administration-records.tsx](<../../../src/components/ui/administration-records.tsx>) |
| A | [src/components/ui/administration-workspace.css](<../../../src/components/ui/administration-workspace.css>) |
| A | [src/components/ui/administration-workspace.tsx](<../../../src/components/ui/administration-workspace.tsx>) |
| M | [src/components/ui/assigned-workforce.tsx](<../../../src/components/ui/assigned-workforce.tsx>) |
| M | [src/components/ui/card.tsx](<../../../src/components/ui/card.tsx>) |
| A | [src/components/ui/heading-help.css](<../../../src/components/ui/heading-help.css>) |
| A | [src/components/ui/heading-help.tsx](<../../../src/components/ui/heading-help.tsx>) |
| M | [src/components/ui/icon.tsx](<../../../src/components/ui/icon.tsx>) |
| M | [src/components/ui/kpi-charts.tsx](<../../../src/components/ui/kpi-charts.tsx>) |
| M | [src/components/ui/kpi-explorer.tsx](<../../../src/components/ui/kpi-explorer.tsx>) |
| M | [src/components/ui/operations-health.tsx](<../../../src/components/ui/operations-health.tsx>) |
| M | [src/components/ui/project-administration.tsx](<../../../src/components/ui/project-administration.tsx>) |
| M | [src/components/ui/project-creation.tsx](<../../../src/components/ui/project-creation.tsx>) |
| A | [src/components/ui/project-home.css](<../../../src/components/ui/project-home.css>) |
| A | [src/components/ui/project-home.tsx](<../../../src/components/ui/project-home.tsx>) |
| A | [src/components/ui/project-member-wizard.tsx](<../../../src/components/ui/project-member-wizard.tsx>) |
| M | [src/components/ui/project-nav.tsx](<../../../src/components/ui/project-nav.tsx>) |
| M | [src/components/ui/project-navigation.ts](<../../../src/components/ui/project-navigation.ts>) |
| M | [src/components/ui/project-recommissioning.tsx](<../../../src/components/ui/project-recommissioning.tsx>) |
| M | [src/components/ui/project-shell-header.tsx](<../../../src/components/ui/project-shell-header.tsx>) |
| A | [src/components/ui/project-templates.tsx](<../../../src/components/ui/project-templates.tsx>) |
| A | [src/components/ui/project-workspace.css](<../../../src/components/ui/project-workspace.css>) |
| M | [src/components/ui/protected-survey-obligations.tsx](<../../../src/components/ui/protected-survey-obligations.tsx>) |
| M | [src/components/ui/record-collection.tsx](<../../../src/components/ui/record-collection.tsx>) |
| M | [src/components/ui/scoped-kpi-entry.tsx](<../../../src/components/ui/scoped-kpi-entry.tsx>) |
| M | [src/components/ui/superintendent-area-obligations.tsx](<../../../src/components/ui/superintendent-area-obligations.tsx>) |
| M | [src/components/ui/survey-command-overview.css](<../../../src/components/ui/survey-command-overview.css>) |
| M | [src/components/ui/survey-command-overview.tsx](<../../../src/components/ui/survey-command-overview.tsx>) |
| M | [src/components/ui/survey-manager-handover.tsx](<../../../src/components/ui/survey-manager-handover.tsx>) |
| M | [src/components/ui/survey-reorganization.tsx](<../../../src/components/ui/survey-reorganization.tsx>) |
| M | [src/components/ui/team-management.tsx](<../../../src/components/ui/team-management.tsx>) |
| A | [src/components/ui/tenant-employee-creation.tsx](<../../../src/components/ui/tenant-employee-creation.tsx>) |

## Verification runners and fixtures

| Change | File |
| --- | --- |
| M | [scripts/run-postgres-tests.mjs](<../../../scripts/run-postgres-tests.mjs>) |
| A | [tests/beta/admin-spaces-browser.mjs](<../../../tests/beta/admin-spaces-browser.mjs>) |
| A | [tests/beta/admin-workflows-browser.mjs](<../../../tests/beta/admin-workflows-browser.mjs>) |
| A | [tests/beta/admin-workflows-http.mjs](<../../../tests/beta/admin-workflows-http.mjs>) |
| A | [tests/beta/alpha1-heading-help-browser.mjs](<../../../tests/beta/alpha1-heading-help-browser.mjs>) |
| A | [tests/beta/alpha1-sidebar-annotations-browser.mjs](<../../../tests/beta/alpha1-sidebar-annotations-browser.mjs>) |
| A | [tests/beta/alpha1-ui-redesign-browser.mjs](<../../../tests/beta/alpha1-ui-redesign-browser.mjs>) |
| A | [tests/beta/alpha1-ui-redesign-fixture.mjs](<../../../tests/beta/alpha1-ui-redesign-fixture.mjs>) |
| M | [tests/beta/lifecycle-writer-handlers-postgres.ts](<../../../tests/beta/lifecycle-writer-handlers-postgres.ts>) |
| A | [tests/beta/project-employee-postgres.ts](<../../../tests/beta/project-employee-postgres.ts>) |
| M | [tests/beta/scoped-offboarding-browser.mjs](<../../../tests/beta/scoped-offboarding-browser.mjs>) |
| A | [tests/beta/survey-viewer-spaces-browser.mjs](<../../../tests/beta/survey-viewer-spaces-browser.mjs>) |
| A | [tests/ui/project-home-data.test.ts](<../../../tests/ui/project-home-data.test.ts>) |
| M | [tests/ui/project-navigation.test.ts](<../../../tests/ui/project-navigation.test.ts>) |

## Current Documentation and Evidence Refresh

These post-checkpoint updates are separate from the pinned Git trees above, even where a prior version is already in the inventory. Their final documentation commit can be indexed in a later refresh without a self-referential hash.

| File | Purpose |
| --- | --- |
| [docs/design/alpha1/README.md](<../../../docs/design/alpha1/README.md>) | Current restoration documentation and inventory |
| [docs/design/alpha1/files.md](<../../../docs/design/alpha1/files.md>) | Current restoration documentation and inventory |
| [docs/design/alpha1/changes.json](<../../../docs/design/alpha1/changes.json>) | Current restoration documentation and inventory |
| [docs/design/alpha1/administration-restoration.md](<../../../docs/design/alpha1/administration-restoration.md>) | Current restoration documentation and inventory |
| [.impeccable/surfaces/administration-refinement.md](<../../../.impeccable/surfaces/administration-refinement.md>) | Current restoration documentation and inventory |
| [docs/README.md](<../../../docs/README.md>) | Current restoration documentation and inventory |
| [docs/CODEX.md](<../../../docs/CODEX.md>) | Parent-owned append-only final batch |
| [audits/alpha1-ui-redesign/administration-restoration-evidence.json](<../../../audits/alpha1-ui-redesign/administration-restoration-evidence.json>) | Parent-owned sanitized exact-source verification and scoped review receipt |

## Runtime Verification Boundary

The restoration runners `tests/beta/admin-workflows-http.mjs` and `tests/beta/admin-workflows-browser.mjs` require the explicitly owned custom restoration fixture/runtime and retained-demo comparison guard described in [the restoration record](administration-restoration.md#verification-and-limitations). They are not generic clean-clone test commands. Raw captures/private fixture manifests and credentials stay local and ignored.

Verify a pinned entry with `git rev-parse <checkpoint>:<path>`; Git blob IDs avoid Windows checkout line-ending ambiguity. Preserve complete branch history during future integration.
