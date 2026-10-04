# Alpha 1 Design Changes

Start here for the design work on `alpha1-ui-redesign` and its eventual integration with continuing `alpha1-audit-hardening` improvements for Alpha 2. This directory is the reference hub: it connects the complete change inventory, approved design contracts, implementation notes, checkpoints and verification evidence. Implementation stays in the existing application/module locations.

## Branch boundary

The design branch starts at hardening commit `b8ff81494c6701bb7f84550b40c247f4588b28cb`. The design implementation checkpoint indexed here is `8efbc481198c0051ac0c3f4937cd89d0a4eb31ba`. Its 11 commits change 76 files relative to that base. The local hardening branch still points to the base when this reference is prepared; remote branches have not been fetched or verified by this documentation pass.

The design changes include presentation behavior, role-aware navigation, composition of existing server-scoped reads, validated Home drill-down filters, appearance, documentation and tests. The inventory confirms no changes under `src/modules/`, `src/app/api/` or `db/`, and no changes to package manifests, lockfile or Dockerfile. Client navigation and remembered project context supply no authorization; existing server checks remain authoritative.

## Reference map

| Reference | Purpose |
| --- | --- |
| [Complete file index](files.md) | Every added/modified file in the pinned design changeset, grouped with clickable source links |
| [Machine-readable inventory](changes.json) | Exact base/checkpoint, commits, Git blob IDs, categories and protected-path assertions |
| [Approved design system](../../../DESIGN.md) | Current visual rules, components, semantic tokens and interaction patterns |
| [Design sidecar](../../../.impeccable/design.json) | Token-bearing machine-readable counterpart; update with DESIGN.md when changing the system |
| [Product contract](../../../PRODUCT.md) | Approved navigation/role/workflow expectations, including superseded shell decisions |
| [Implementation and scope notes](../../ALPHA1_UI_REDESIGN.md) | Shell, Home, heading help, Survey/Viewer and historical verification detail |
| [Shell/Home surface brief](../../../.impeccable/surfaces/alpha1-project-home.md) | Incumbent composition, refinements and reviewed scope |
| [Survey/Viewer surface brief](../../../.impeccable/surfaces/survey-viewer-refinement.md) | Comparable role-space treatment and scoped finish disposition |
| [Batch history](../../CODEX.md) | Append-only implementation/review history, batches 128–137 for design work |
| [Original Alpha 1 audit](../../../audits/alpha1/REPORT.md) | Existing hardening findings and open decisions carried into integration |

This hub links to canonical contracts rather than duplicating tokens or moving runtime files. Its inventory is a pinned snapshot, not a claim that future branch changes are included automatically. This reference preparation adds the hub and entry-point links; it does not change the indexed implementation.

## What ships with the design branch

- One authenticated workspace with a flush-left 224px desktop sidebar, full-width header and native left drawer below 1000px, across project and account screens. Account actions live in the sidebar; the redundant top-right Menu is removed. The drawer has a 44px SVG × button named **Close navigation** for assistive technology, Escape/backdrop dismissal and focus return.
- Role-aware Home dashboards using existing authorized reads and current capabilities. Counts retain their actual all-date/current-state/UTC Need-By definitions. Independent administration stays additive, and combined non-Manager analytics limitations remain enforced.
- Title-case headings and adjacent independent question-mark help. Explanatory scope/provenance/date guidance remains available on hover, focus and tap; values, alerts, validation and confirmation facts remain visible.
- Single-line status badges and review actions, contained horizontal table overflow, bounded chart record scrolling and sticky headers. Shared planned badge text uses existing primary ink in Light/Dark.
- Comparable Survey Command, Operations, named Survey Teams, Crew Work and Viewer Review treatment. Viewer request details return to All Requests; field roles return to Crew Work; requester Drafts navigation remains scoped to requesters. Mobile Crew action groups retain compact rows.
- Existing Axiom identity, Roboto, semantic themes, server permissions, workflow/retry rules and retained customer data.

## Checkpoints

| Stage | Commits |
| --- | --- |
| Role-aware shell and Home; account navigation; initial documentation | `285b6ce`, `dc77039`, `4fd9d23` |
| Universal sidebar and annotation/table corrections | `0487dcc`, `a1be862` |
| Heading capitalization and contextual help | `13ada0e`, `406054a` |
| Survey/Viewer implementation and reviewed corrections | `e0ba406`, `d77983d` |
| Drawer × and existing browser selector alignment | `74d558a`, `8efbc48` |

Preserve the complete branch history during integration. Later commits depend on earlier shared components; this is not a set of independent patches to select arbitrarily.

## Verification records

| Recorded stage | Evidence | Scope |
| --- | --- | --- |
| Earlier project-only shell/Home/account navigation | [evidence.json](../../../audits/alpha1-ui-redesign/evidence.json) | Historical 688 checks / 43 captures |
| Universal authenticated sidebar and chart tables | [annotations-evidence.json](../../../audits/alpha1-ui-redesign/annotations-evidence.json) | 568 annotation checks / 70 captures at its recorded source digest |
| Heading/help refinement | [heading-help-evidence.json](../../../audits/alpha1-ui-redesign/heading-help-evidence.json) | 206 checks / 40 captures at its recorded source digest |
| Survey/Viewer refinement | [survey-viewer-evidence.json](../../../audits/alpha1-ui-redesign/survey-viewer-evidence.json) | 716 checks / 68 captures at its recorded source digest |
| Later drawer × change | [Batch 137](../../CODEX.md) and commits above | Strict types, 566 tests, pinned production build; actual 797/390 browser geometry, click/Enter/Escape and focus-return checks |

The Survey/Viewer digest also records 27 PostgreSQL suites, 52 HTTP checks, 24 lifecycle browser checks, 26 lost-response checks and 55/55 named cases. Those full suites were not rerun for the later isolated drawer SVG/CSS change. Each evidence artifact describes its own source digest and limited review scope; their counts cannot be added together as current-HEAD acceptance.

Sanitized JSON is versioned. Raw screenshots, logs, private fixture manifests, credentials and demo runtime settings remain ignored/local; capture hashes and local paths in the artifacts do not make those images available in a fresh clone. Local screenshots are verification captures, not required shipping assets. A clean clone can inspect the source/contracts/evidence; new runtime acceptance requires newly owned fixtures as described in [the repository verification guide](../../README.md).

## Integrate when Alpha 2 is authorized

1. Preserve both development lines. Continue hardening on `alpha1-audit-hardening` and design work on `alpha1-ui-redesign`. Update this inventory and the appropriate contracts/evidence after future design checkpoints; keep earlier evidence immutable.
2. In a clean isolated checkout, identify the latest authoritative hardening and design refs. Fetch when ready to use remote refs; include any intended local commits before choosing them. Record their exact SHAs and common ancestor. Do not move the hardening branch backward to this document's historical base.
3. Create the Alpha 2 integration branch from the latest hardening ref, then merge the complete design branch. A reviewable local sequence, to run at that later time, is:

   ```sh
   git switch -c codex/alpha2-integration <latest-hardening-ref>
   git merge --no-ff --no-commit <latest-design-ref>
   ```

   The branch name is a suggested integration name. No integration branch, merge, push or Alpha 2 initialization is performed by preparing this reference.
4. Resolve overlaps by preserving current hardening contracts and the approved design behavior together. Review semantic changes even when Git merges cleanly. Pay particular attention to capability/access loading in AccountShell/ProjectShellHeader, navigation destinations and logout, the Home data/filter adapters, request detail returns, shared Card/record/KPI/help components, appearance CSS and administrative pages. Do not accept an entire side wholesale for these files. Reconcile PRODUCT.md, DESIGN.md and its sidecar; preserve both CODEX histories without decoding/re-encoding historical invalid bytes.
5. Verify the combined result at its new source digest: strict/unused TypeScript, unit tests, pinned production build/audit, actual PostgreSQL and HTTP authority/lifecycle suites, existing lifecycle/lost-response cases and all 55 named acceptance cases. Rerun the design browser runners listed in the file index across roles, independent admin combinations, Light/Dark and desktop/mobile. Check account pages, denied/restored project access, tooltips, table actions and drawer dismissal. Use newly owned disposable data; never seed/reset retained demo/customer state. Existing design or hardening receipts do not verify the merged code.
6. Record new integration evidence and resolve the existing Alpha 1 audit's remaining decisions/findings through their own authority process. Commit the reviewed merge when authorized. Push/release/Alpha 2 readiness remain explicit later actions.

For read-only comparisons at that time:

```sh
git merge-base <latest-hardening-ref> <latest-design-ref>
git diff --name-status <common-ancestor> <latest-design-ref>
git log --reverse --oneline <common-ancestor>..<latest-design-ref>
```

Refresh `changes.json` and `files.md` with the new exact design checkpoint if the branch advances. Git blob IDs in the current manifest can verify that the indexed files match the pinned commit independently of Windows checkout line endings.
