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

Tenant/Central IT administration is independent of operational membership. Project Admin has current scoped administration. Internal invitation accepts a new profile with Requester membership only; administration is granted separately afterward. Preserve existing roles and refuse disabled access restoration. New writers retain lifecycle barriers, current authority before recorded replay and atomic administrative evidence. Optional keys for templates, subcontractor invitations and configuration preserve unkeyed clients.

## Delivery evidence

Strict/unused TypeScript compilation and pinned production build passed. Visual inspection is bounded to the fresh Tenant IT demo and non-submitted task surfaces. No new tests/test suites requested or run. Mutation, concurrency, lost-response, alternate-role and fault rollback acceptance remain unverified for this patch. Alpha1 results are baseline evidence only.

Coverage and walkthrough: [fresh startup](../audits/fresh-startup/NOTES.md). Current design: [DESIGN.md](../DESIGN.md).
