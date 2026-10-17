# Administration Pop-ups and Task Refinements

This follows checkpoint `78c44df` and the owner's six annotated refinements. Company registration, existing-company association and selected removal now use a native modal review instead of a confirmation further down the page. The dialog moves focus into the review, makes background controls inert, supports Escape/close before submission and restores the initiating control's focus. Its header and scrollable body use the existing Roboto, semantic surfaces, panel radius and icon system. Selected removal still shows every Company ID, current blockers and retained-history scope.

Uncertain/pending/stale commands cannot be dismissed: close and Escape preserve the original body/key and shared owner. Error feedback stays inside the modal, so it is visible during protected focus. Existing exact retry and deliberate409 reload/new consent remain authoritative; success closes the review and updates the page. No company removal behavior, audit semantics or historical data are changed.

Pending Invitations and Restore Removed Members now start collapsed and use the existing disclosure pattern. Content stays mounted, preserving loaded records and form state. A held command prevents collapsing its section. The recovery heading remains an h2, with adjacent help and current read-only/authority checks.

The duplicate administration Help Desk tab is removed. The sidebar page retains the same server-scoped member/admin queue and management capabilities. Old `/admin/help-desk` and `/admin/administrators` URLs redirect to `/projects/[projectId]/help-desk`.

Project Admin's Personnel page contains the project member roster, without a separate administrator roster or assignment panel. Its client does not request the assignment roster. Tenant Admin retains independent administrator creation/assignment on Personnel. The assignment roster GET now enforces Tenant Admin authority on the server; existing POST grants/revocations remain Tenant Admin only. Ordinary project membership visibility, access removal, role assignment and survey duties retain their approved contracts.

## Integration Files

- [Native review dialog](../../../src/components/ui/administration-dialog.tsx) and [styles](../../../src/components/ui/administration-dialog.css).
- [ProjectAdministration](../../../src/components/ui/project-administration.tsx): company modal reviews and Tenant Admin-only assignment section/read.
- [AdministrationSection](../../../src/components/ui/administration-records.tsx), [member recovery](../../../src/components/ui/member-access-recovery.tsx) and [Subcontractor Access](../../../src/app/(projects)/projects/[projectId]/(admin)/admin/subcontractor-access.tsx): collapsible inventories.
- [Workspace navigation](../../../src/app/(projects)/projects/[projectId]/(admin)/admin/workspace.tsx), [legacy Help Desk](../../../src/app/(projects)/projects/[projectId]/(admin)/admin/help-desk/page.tsx) and [legacy administrators](../../../src/app/(projects)/projects/[projectId]/(admin)/admin/administrators/page.tsx).
- [Assignment roster authority](../../../src/app/api/projects/[projectId]/administrators/route.ts).
- [PostgreSQL authority cases](../../../tests/beta/project-administration-postgres.ts), [company removal/modal checks](../../../tests/beta/company-removal-acceptance.mjs), and [six-refinement browser checks](../../../tests/beta/administration-refinement-browser.mjs).

## Verification Boundary

The focused runners use the same explicitly owned synthetic manifest/runtime guard documented in [selected company removal](company-removal.md#verification-boundary), with `SWR_ROLE_ACCESS=1`, different-schema retained-demo guard, loopback PostgreSQL127.0.0.1:15493/swr_team_isolated, production origin/JWT and installed Playwright/Edge. They are not generic clean-clone provisioning or authorization to reuse retained records. They check native dialog state, keyboard focus/return, held-command Escape/close, exact lost-response retry, dependency409, both disclosure states, legacy redirects, server roster authority and both administrative views. Current registration mutations use unique synthetic companies only.

Final source receipts and limits: [sanitized evidence](../../../audits/alpha1-ui-redesign/administration-dialogs-evidence.json). Existing design records/captures remain historical evidence at their original scope. No migration, retained reset, push, merge or Alpha2 initialization is part of this refinement.


## Final Checkpoint

Strict types including unused checks, all 584 unit tests, the pinned production build and all 30 actual PostgreSQL suites pass. The final image passes 46 company-removal/modal HTTP/browser checks, 30 six-refinement browser/API checks and 19 role-eligibility/Archived recovery checks. The existing conditional runner now expands Restore Removed Members before inspecting Archived history; restoration remains denied without evidence or membership changes. Initial browser timing assertions for streamed legacy redirects and asynchronously loaded Tenant Admin creation were corrected with explicit waits; runtime contracts were not weakened.

All twelve final Light captures were opened at desktop, owner-width and phone sizes. Independent Impeccable finish disposition is **ship**, with no material fixes at this narrow scope. The single changed-target detector reported a literal-radius advisory; the dialog uses the incumbent `--radius-panel` token in the final build. This is not a new whole-app, Dark-theme or unchanged-surface clearance.

The retained inspection demo at port3124 runs the final image with its original environment and file volume. Fresh pre/post row digests match current accounts, preferences, companies/associations, invitations, requests/history, attachment records, projects, memberships/teams, grants/custom roles and administrative/lifecycle evidence. The existing Alex Rivera browser session shows the ordinary Project Members roster, five administration tasks and the sidebar Help Desk, with no separate administrator panel. No retained company or membership action was submitted by the agent. Earlier user removals remain intact.
