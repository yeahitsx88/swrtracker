# Administration task dialogs

## When to use

Use AdministrationDialog for focused creation, edit or consequential review from an administrative inventory. Keep navigation, filtering, sorting, paging, selection, export, refresh and copy direct. Native role options remain selects.

## Interaction contract

- Show the task name and named steps. Ask for coherent inputs per step, then show an explicit creation review.
- Keep wizard actions in the visible footer. Preserve values on Back. Cancel/Close/Escape/backdrop dismiss only without pending or uncertain commands.
- Native modal focus makes the background inert. Focus the heading on entry/step changes and restore the entry control on exit. Long evidence scrolls inside; table regions scroll horizontally at narrow widths.
- Validate active input and show server errors in front. Show the saved result in the same dialog, including its reference or shareable invitation link where appropriate.
- Use server-paged, tenant-scoped directories for named people/companies. Records picker mode removes duplicate controls; inventories keep complete controls.
- A prerequisite company can be registered inside an invitation. The child shares the parent's CommandOwner token without releasing it; the parent stays mounted and guarded while the child has protected focus. Return with the created company selected, or return without creating anything. Preserve invitation values in either case.
- Keep asynchronous onboarding resumable: invite -> awaiting acceptance -> accepted profile -> explicit reviewed assignment -> assigned result. The same invitation record identifies the profile; no separate employee search is needed after acceptance.
- Freeze body/key after an uncertain response, disable editing/dismissal and retry the exact intent. Definitive409 requires deliberate reload and fresh confirmation. Shared CommandOwner protects sibling unresolved intent.

## Authority and data

Tenant/Central IT administration is independent of operational membership. Project Admin has current scoped administration. Project Admin candidate invitations create Requester membership only; administration is granted separately afterward. Internal project member invitations bind the selected fixed operational role before acceptance. Existing invitation-bound Identity registration creates that membership; no new admin grant is inferred. Subcontractor invitations remain Requester-only. Preserve existing roles and refuse disabled access restoration. New writers retain lifecycle barriers, current authority before recorded replay and atomic administrative evidence. Optional keys for templates, subcontractor invitations and configuration preserve unkeyed clients.

## Delivery evidence

Strict/unused TypeScript compilation and pinned production build passed. Visual inspection is bounded to the fresh Tenant IT demo and non-submitted task surfaces. No new tests/test suites requested or run. Mutation, concurrency, lost-response, alternate-role and fault rollback acceptance remain unverified for this patch. Alpha1 results are baseline evidence only.

Coverage and walkthrough: [fresh startup](../audits/fresh-startup/NOTES.md). Current design: [DESIGN.md](../DESIGN.md).


## Administration guidance and enrollment (Decision54)

- Optional instructions use ContextHelp beside Card, section or dialog headings. Hover, focus, click/tap and Escape work; the help remains within viewport bounds. Keep necessary review evidence, statuses and field validation visible.
- Project administration has Admin & personnel, Companies, Survey and Project settings workspaces. Personnel includes independent Project Admin grants, existing member enrollment and new-member invitations. Companies includes registration and subcontractor access; Survey contains reviewer responsibilities; settings contains templates, diagnostics, request configuration, access settings and draft recovery.
- Project Admin setup offers future-admin invitation or an existing employee. The redundant employee-first admin option is removed; prior employee invitations remain accessible through member invitations.
- A new internal member chooses tenant/existing/new company, email and one supported operational role before invitation review. Acceptance uses that bound role. No generalized RBAC, new role type or automatic Project Admin grant is introduced.
- Subcontractor company registration can be launched inside its requester invitation with type restricted to SUBCONTRACTOR; the same ownership/frozen-command continuation returns to the preserved invitation with the company selected.
- Personnel inventories show operational role and independent Project Admin administration in separate columns. Dense tables use wider dialogs and intact words with keyboard-reachable horizontal scrolling at narrow widths.
- Reviewer handover transfers one live Area review grant to an eligible current Superintendent after replacement coverage review. It does not appoint the first Survey Manager and does not resolve every staffing obligation.
