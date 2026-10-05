# Alpha 1 Design Changes

Start here for the design work on `alpha1-ui-redesign` and its eventual integration with continuing `alpha1-audit-hardening` improvements for Alpha 2. This directory is the reference hub: it connects the complete change inventory, approved design contracts, implementation notes, checkpoints and verification evidence. Implementation stays in the existing application/module locations.

## Branch boundary

The design branch starts at hardening commit `b8ff81494c6701bb7f84550b40c247f4588b28cb`. The implementation checkpoint indexed here is `66b66ad0f57475e06cdb36b614e16e0d354612b2`. Its 18 commits change 116 files relative to that base. Documentation/evidence prepared after that checkpoint is listed separately. Remote branches have not been fetched or verified by this documentation pass; use the latest authoritative hardening ref for eventual integration.

The branch includes presentation behavior, role-aware navigation, existing server-scoped reads, validated Home drill-down filters, appearance, documentation/tests and the owner-authorized administration restoration. Restoration crosses authenticated employee provisioning, reused Identity creation, Tenancy membership/independent grants and Audit evidence; invitations, request configuration and templates add optional exact retry support. The inventory now includes administrative APIs, Tenancy/Audit source and lifecycle writer coverage. There are no migration, contract, package manifest, lockfile or Dockerfile changes. Client navigation and remembered project context supply no authorization; current server checks remain authoritative before resource use and recorded replay.

## Reference map

Current in-progress role/action and follow-up administration work: [Role Access Audit and Custom Roles](role-access-audit.md). This next increment adds migration035 and functional APIs; the pinned inventory below remains the previous completed restoration snapshot until the next verified refresh.

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
| [Tenant IT/Project Admin extension](administration.md) | Scoped composition, source map and finish handoffs |
| [Administration workflow restoration](administration-restoration.md) | Current route-backed tabs, restored employee/member/admin/company/template workflows, shared command owner/notices and exact verification boundaries |
| [Administration surface brief](../../../.impeccable/surfaces/administration-refinement.md) | Current route/task and administrative preservation contract |
| [Batch history](../../CODEX.md) | Append-only implementation/review history, including restoration checkpoints and final receipt |
| [Original Alpha 1 audit](../../../audits/alpha1/REPORT.md) | Existing hardening findings and open decisions carried into integration |

This hub links to canonical contracts rather than duplicating tokens or moving runtime files. Its inventory is a pinned snapshot, not a claim that future branch changes are included automatically. Refresh this hub, inventory and applicable surface records at each later design checkpoint. Current documentation/evidence updates remain separate from the pinned implementation trees to avoid a self-referential commit hash. PRODUCT.md, DESIGN.md and the sidecar remain incumbent; the restoration record reports pre-existing prose/preview drift without repairing it.

## What ships with the design branch

- One authenticated workspace with a flush-left 224px desktop sidebar, full-width header and native left drawer below 1000px, across project and account screens. Account actions live in the sidebar; the redundant top-right Menu is removed. The drawer has a 44px SVG × button named **Close navigation** for assistive technology, Escape/backdrop dismissal and focus return.
- Role-aware Home dashboards using existing authorized reads and current capabilities. Counts retain their actual all-date/current-state/UTC Need-By definitions. Independent administration stays additive, and combined non-Manager analytics limitations remain enforced.
- Title-case headings and adjacent independent question-mark help. Explanatory scope/provenance/date guidance remains available on hover, focus and tap; values, alerts, validation and confirmation facts remain visible.
- Single-line status badges and review actions, contained horizontal table overflow, bounded chart record scrolling and sticky headers. Shared planned badge text uses existing primary ink in Light/Dark.
- Comparable Survey Command, Operations, named Survey Teams, Crew Work and Viewer Review treatment. Viewer request details return to All Requests; field roles return to Crew Work; requester Drafts navigation remains scoped to requesters. Mobile Crew action groups retain compact rows.
- Tenant IT and Project Admin use separate route-backed task tabs, mounted retained editors, independent introduction help, contained inventories, neutral single-line access/grant badges and shared action styling. Guided creation restores employees, eligible members, independent Project Admin accounts, companies and templates. Fixed operational labels use title case in scrollable native lists. Each workspace shares its command owner across sibling tasks; exact uncertain retry state, stale reload/consent and visible task notices survive sibling navigation. Tenant IT discovery follows server capability; operational membership and independent Project Admin authority remain separate.
- Existing Axiom identity, Roboto, semantic themes, server permissions, workflow/retry rules and retained customer data.

## Checkpoints

| Stage | Commits |
| --- | --- |
| Role-aware shell and Home; account navigation; initial documentation | `285b6ce`, `dc77039`, `4fd9d23` |
| Universal sidebar and annotation/table corrections | `0487dcc`, `a1be862` |
| Heading capitalization and contextual help | `13ada0e`, `406054a` |
| Survey/Viewer implementation and reviewed corrections | `e0ba406`, `d77983d` |
| Drawer × and existing browser selector alignment | `74d558a`, `8efbc48` |
| Central reference hub | `bc4c806` |
| Tenant IT/Project Admin implementation and bounded badge correction | `d5c0917`, `c3cb158` |
| Original administrative record and hub refresh | `531007a` |
| Route-backed administration and account creation restoration | `eb84572` |
| Restoration acceptance and retained editor state | `645ebeb` |
| Shared workspace owner and visible task recovery notices | `66b66ad` |

Preserve the complete branch history during integration. Later commits depend on earlier shared components; this is not a set of independent patches to select arbitrarily.

## Verification records

| Recorded stage | Evidence | Scope |
| --- | --- | --- |
| Earlier project-only shell/Home/account navigation | [evidence.json](../../../audits/alpha1-ui-redesign/evidence.json) | Historical 688 checks / 43 captures |
| Universal authenticated sidebar and chart tables | [annotations-evidence.json](../../../audits/alpha1-ui-redesign/annotations-evidence.json) | 568 annotation checks / 70 captures at its recorded source digest |
| Heading/help refinement | [heading-help-evidence.json](../../../audits/alpha1-ui-redesign/heading-help-evidence.json) | 206 checks / 40 captures at its recorded source digest |
| Survey/Viewer refinement | [survey-viewer-evidence.json](../../../audits/alpha1-ui-redesign/survey-viewer-evidence.json) | 716 checks / 68 captures at its recorded source digest |
| Later drawer × change | [Batch 137](../../CODEX.md) and commits above | Strict types, 566 tests, pinned production build; actual 797/390 browser geometry, click/Enter/Escape and focus-return checks |
| Tenant IT/Project Admin extension | [administration-evidence.json](../../../audits/alpha1-ui-redesign/administration-evidence.json) | 18 grouped design browser checks / 18 opened captures at 1864/797/390 in Light/Dark; independent reviewer disposition **ship** |
| Owner-requested administration restoration | [administration-restoration-evidence.json](../../../audits/alpha1-ui-redesign/administration-restoration-evidence.json), [restoration record](administration-restoration.md) | Current source: 156 browser assertions / 54 individually inspected captures; both original material fixes resolved; same-reviewer **ship** limited to the two corrections; retained-demo preservation passed |

The historical administrative digest records strict types, 566 unit tests, pinned production build, 27 PostgreSQL suites, 52 HTTP checks, 24 lifecycle browser checks, 26 lost-response checks and 55/55 named cases after the badge correction. Its retained demo digests and 18-capture verdict apply to that earlier increment. The owner subsequently rejected its missing workflows and section composition; its ship verdict does not verify the restoration.

Current restoration source/migration digest `c55319a99104301b924a71c9604e5752d5c376b1ca853346ea64f02d65c5d18c` passes strict/unused types, 566 unit/route tests, pinned production build, 28 PostgreSQL suites, 33 restoration HTTP checks, 52 existing lifecycle HTTP checks, 24 existing lifecycle browser checks, 26 lost-response browser checks, 55/55 named cases and 156 restoration browser assertions with 54 captures. The two material defects from its fresh full review were competing command owners and notices hidden on Personnel. `66b66ad` corrects these; the same reviewer scored both resolved and returned ship limited to those corrections, individually validating all 54 raw captures. No new full-surface clearance or release/security approval is claimed. Final demo image refresh and matching before/after read-only preservation digests passed. DESIGN.md/sidecar are preserved for this ordinary extension; recorded page-hierarchy prose and disclosure preview drift remain explicit in the restoration record.

The Survey/Viewer digest also records 27 PostgreSQL suites, 52 HTTP checks, 24 lifecycle browser checks, 26 lost-response checks and 55/55 named cases. Those full suites were not rerun for the later isolated drawer SVG/CSS change. Each evidence artifact describes its own source digest and limited review scope; their counts cannot be added together as current-HEAD acceptance.

Sanitized JSON is versioned. Raw screenshots, logs, private fixture manifests, credentials and demo runtime settings remain ignored/local; capture hashes and local paths in the artifacts do not make those images available in a fresh clone. Local screenshots are verification captures, not required shipping assets. A clean clone can inspect source/contracts/evidence; new runtime acceptance requires newly owned fixtures described in [the verification guide](../../README.md). The new restoration runners require an explicitly owned custom fixture/runtime and retained-demo different-schema guard; the generic lifecycle setup is insufficient by itself. See [restoration verification boundaries](administration-restoration.md#verification-and-limitations).

## Integrate when Alpha 2 is authorized

1. Preserve both development lines. Continue hardening on `alpha1-audit-hardening` and design work on `alpha1-ui-redesign`. Update this inventory and the appropriate contracts/evidence after future design checkpoints; keep earlier evidence immutable.
2. In a clean isolated checkout, identify the latest authoritative hardening and design refs. Fetch when ready to use remote refs; include any intended local commits before choosing them. Record their exact SHAs and common ancestor. Do not move the hardening branch backward to this document's historical base.
3. Create the Alpha 2 integration branch from the latest hardening ref, then merge the complete design branch. A reviewable local sequence, to run at that later time, is:

   ```sh
   git switch -c codex/alpha2-integration <latest-hardening-ref>
   git merge --no-ff --no-commit <latest-design-ref>
   ```

   The branch name is a suggested integration name. No integration branch, merge, push or Alpha 2 initialization is performed by preparing this reference.
4. Resolve overlaps by preserving current hardening contracts and approved design behavior together. Review semantic changes even when Git merges cleanly. Pay particular attention to capability/access loading in AccountShell/ProjectShellHeader, navigation/logout, Home data/filter adapters, detail returns, shared Card/record/KPI/help components, appearance and route-backed administrative layouts. Reconcile employee Identity/Tenancy/Audit coordination, lifecycle writer inventory, fresh-authority checks before idempotent replay, invitation/config/template retries and shared command owners/notices with the latest hardening contracts. Do not accept an entire side wholesale. Reconcile PRODUCT.md, DESIGN.md and its sidecar, including explicitly recorded drift; preserve both CODEX histories without decoding/re-encoding historical invalid bytes.
5. Verify the combined result at its new source digest: strict/unused TypeScript, unit tests, pinned production build/audit, actual PostgreSQL and HTTP authority/lifecycle suites, employee provisioning, existing lifecycle/lost-response cases and all 55 named acceptance cases. Rerun the design and restoration browser runners across roles, independent admin combinations, Light/Dark and desktop/mobile. Check every administrative tab, functioning creation, exact retries, competing sibling locks, originating/shared notices, archived protection, denied/restored access, help, table actions and drawer dismissal. Provision the explicitly owned restoration fixture/runtime and retained-demo guard separately. Use new disposable data; never seed/reset retained state. Existing receipts do not verify the merged code.
6. Record new integration evidence and resolve the existing Alpha 1 audit's remaining decisions/findings through their own authority process. Commit the reviewed merge when authorized. Push/release/Alpha 2 readiness remain explicit later actions.

For read-only comparisons at that time:

```sh
git merge-base <latest-hardening-ref> <latest-design-ref>
git diff --name-status <common-ancestor> <latest-design-ref>
git log --reverse --oneline <common-ancestor>..<latest-design-ref>
```

Refresh `changes.json` and `files.md` with the new exact design checkpoint if the branch advances. Git blob IDs in the current manifest can verify that the indexed files match the pinned commit independently of Windows checkout line endings.

## Role Access and Support Checkpoints

The current [role/action audit](role-access-audit.md) and [sanitized evidence](../../../audits/alpha1-ui-redesign/role-access-evidence.json) extend the completed restoration. Checkpoints `45a67e3` and `7288761` introduce migrations035/036, tenant-wide Requester/Viewer aliases, scoped support conversations, administrative membership restoration and measured HTTP metadata. The finish correction preserves visible sibling notices and scopes Project Admin catalog counts. These functional modules, migrations, audit guards and tests must travel with their UI during Alpha2 integration; do not cherry-pick CSS alone. High/Medium audit gaps remain explicit, so current passing regression counts are not full role-matrix readiness or Alpha2 approval. Earlier `changes.json`/`files.md` remain immutable manifests of their named completed checkpoint; use the new source/evidence map for this later functional increment.

Verified final milestone `6944175`: [complete later-increment inventory](role-access-files.md) and [exact Git blob manifest](role-access-changes.json), from restoration reference `4e254cc`. The updated local demo preserves its records and uses additive migrations035/036. The listed-fix review scores both final conditional UI corrections resolved; the source audit still records remaining High workflow gaps.

The subsequent [duplicate company guard](company-name-guard.md) maps both creation paths, UI feedback, concurrency/variant acceptance and source-bound evidence. Include this correction with the role/support increment; existing company records are preserved.

Current company inventory extension: [Selected Project Company Removal](company-removal.md) maps its reviewed project-only removal, dependency checks, retained history, API/module changes and verification. Earlier pinned manifests remain historical snapshots.

Latest administration refinement: [Pop-ups and Task Refinements](administration-dialogs.md) maps native company review dialogs, collapsible inventories, sidebar-only Help Desk, Tenant Admin-only assignment roster and its matching verification.

- [Reusing removed companies](company-reuse.md): find retained tenant records by name and explicitly add the original ID back to a project.

- [Shared design audit and refinement](design-refinement.md): approved rounded buttons and sidebar destinations, softer panels, distinct navigation icons, readable hover/disabled states, and restrained Home metric accents; existing page layouts and tenant customization remain intact.
