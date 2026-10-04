# Complete Alpha 1 Design File Index

[Return to the reference hub](README.md). The corresponding [manifest](changes.json) records exact Git blob IDs and commits.

Inventory: **76 files**, **11 commits**, base `b8ff81494c6701bb7f84550b40c247f4588b28cb`, design checkpoint `8efbc481198c0051ac0c3f4937cd89d0a4eb31ba`. `A` means added and `M` modified relative to that base.

Links open current checkout files. The manifest pins the indexed versions; later edits do not update the snapshot automatically. Reference-hub preparation is listed separately at the end.

## Application pages and appearance

| Change | File |
| --- | --- |
| M | [src/app/(auth)/login/page.tsx](<../../../src/app/(auth)/login/page.tsx>) |
| M | [src/app/(projects)/accounts/page.tsx](<../../../src/app/(projects)/accounts/page.tsx>) |
| M | [src/app/(projects)/appearance/page.tsx](<../../../src/app/(projects)/appearance/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(admin)/admin/draft-recovery.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/draft-recovery.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(admin)/admin/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(admin)/admin/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(crew)/crew/work/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(crew)/crew/work/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(requester)/my-requests/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(requester)/my-requests/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(requester)/tickets/[ticketId]/page.tsx](<../../../src/app/(projects)/projects/[projectId]/(requester)/tickets/[ticketId]/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/(survey)/survey/operations/operations.css](<../../../src/app/(projects)/projects/[projectId]/(survey)/survey/operations/operations.css>) |
| A | [src/app/(projects)/projects/[projectId]/home/page.tsx](<../../../src/app/(projects)/projects/[projectId]/home/page.tsx>) |
| M | [src/app/(projects)/projects/[projectId]/layout.tsx](<../../../src/app/(projects)/projects/[projectId]/layout.tsx>) |
| M | [src/app/(projects)/projects/page.tsx](<../../../src/app/(projects)/projects/page.tsx>) |
| M | [src/app/appearance.css](<../../../src/app/appearance.css>) |
| M | [src/app/globals.css](<../../../src/app/globals.css>) |

## Design contracts and implementation documentation

| Change | File |
| --- | --- |
| M | [.impeccable/design.json](<../../../.impeccable/design.json>) |
| A | [.impeccable/surfaces/alpha1-project-home.md](<../../../.impeccable/surfaces/alpha1-project-home.md>) |
| A | [.impeccable/surfaces/survey-viewer-refinement.md](<../../../.impeccable/surfaces/survey-viewer-refinement.md>) |
| M | [DESIGN.md](<../../../DESIGN.md>) |
| M | [PRODUCT.md](<../../../PRODUCT.md>) |
| A | [docs/ALPHA1_UI_REDESIGN.md](<../../../docs/ALPHA1_UI_REDESIGN.md>) |
| M | [docs/CODEX.md](<../../../docs/CODEX.md>) |

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
| M | [src/components/ui/project-nav.tsx](<../../../src/components/ui/project-nav.tsx>) |
| M | [src/components/ui/project-navigation.ts](<../../../src/components/ui/project-navigation.ts>) |
| M | [src/components/ui/project-recommissioning.tsx](<../../../src/components/ui/project-recommissioning.tsx>) |
| M | [src/components/ui/project-shell-header.tsx](<../../../src/components/ui/project-shell-header.tsx>) |
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

## Verification runners and fixtures

| Change | File |
| --- | --- |
| A | [tests/beta/alpha1-heading-help-browser.mjs](<../../../tests/beta/alpha1-heading-help-browser.mjs>) |
| A | [tests/beta/alpha1-sidebar-annotations-browser.mjs](<../../../tests/beta/alpha1-sidebar-annotations-browser.mjs>) |
| A | [tests/beta/alpha1-ui-redesign-browser.mjs](<../../../tests/beta/alpha1-ui-redesign-browser.mjs>) |
| A | [tests/beta/alpha1-ui-redesign-fixture.mjs](<../../../tests/beta/alpha1-ui-redesign-fixture.mjs>) |
| M | [tests/beta/scoped-offboarding-browser.mjs](<../../../tests/beta/scoped-offboarding-browser.mjs>) |
| A | [tests/beta/survey-viewer-spaces-browser.mjs](<../../../tests/beta/survey-viewer-spaces-browser.mjs>) |
| A | [tests/ui/project-home-data.test.ts](<../../../tests/ui/project-home-data.test.ts>) |
| M | [tests/ui/project-navigation.test.ts](<../../../tests/ui/project-navigation.test.ts>) |

## Reference preparation files

These documentation additions/links organize the pinned implementation for review and integration. They are outside the 76-file snapshot above.

| File |
| --- |
| [docs/design/alpha1/README.md](<../../../docs/design/alpha1/README.md>) |
| [docs/design/alpha1/files.md](<../../../docs/design/alpha1/files.md>) |
| [docs/design/alpha1/changes.json](<../../../docs/design/alpha1/changes.json>) |
| [docs/README.md](<../../../docs/README.md>) |
| [docs/ALPHA1_UI_REDESIGN.md](<../../../docs/ALPHA1_UI_REDESIGN.md>) |
| [docs/CODEX.md](<../../../docs/CODEX.md>) |
