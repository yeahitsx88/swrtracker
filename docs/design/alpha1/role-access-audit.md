# Role Access Audit and Custom Roles

This is the current integration reference for the owner's role/action audit and follow-up administration annotations. It extends the incumbent Axiom design on `alpha1-ui-redesign`; migration035 and new Tenancy APIs are functional changes that must travel with their UI when integrating into Alpha2. Existing hardening history remains intact.

## Approved Clarifications

- Tenant Admin alone creates, edits and deletes tenant-wide custom roles. Project Admin assigns them within administered projects.
- Custom roles inherit exactly Requester or Viewer permissions, with no additional capability bits. Existing and future projects read the shared tenant catalog.
- Survey authority follows Survey Manager → Area Survey Superintendent → Area Party Chief → Instrument Man through crew/reporting membership. Area and explicit assignment constrain recovery.
- Project Access means granting/removing access. Administrators manage role/access decisions; Survey Manager and scoped Superintendents manage crew structure.
- Superintendents may remove only supervised personnel after active obligations are resolved.
- Survey recovery restores cancelled/rejected submitted requests to Returned for Correction. Deleted drafts are recoverable only by Project Admin or Tenant Admin. These approvals supersede narrower historical recovery rules; the implementation audit must identify every remaining gap.
- Existing Requester submission/tracking, Chief assigned field review/work, Instrument Man assigned work/data upload and Viewer authorized read workflows remain the core audit baseline.
- Project Admin assignment is strictly Tenant Admin-only, including direct APIs and employee provisioning with an independent grant.

## Custom Role Milestone

The Name / Template / Review and Deploy wizard lives on `/accounts/roles`. The server-rendered tenant layout gates the wizard; APIs independently require current Tenant Admin. Versioned catalog updates propagate template permissions to every assignment and renew affected sessions. Assigned roles cannot be deleted, including historical memberships. System role names are reserved and system role records are not editable through this catalog.

Project member creation, existing account addition and existing Requester/Viewer assignment pickers use the shared catalog and send its current version. Survey role transitions continue through their obligation-aware staffing workflows. Every mutation holds the tenant EXCLUSIVE barrier, revalidates authority before replay, and writes evidence atomically. A lost response retains the original reviewed body/key and blocks sibling editors; a definitive conflict requires reload and renewed consent.

Source map: [migration035](../../../db/migrations/035_tenant_custom_roles.sql), [catalog rules](../../../src/modules/tenancy/application/custom-roles.ts), [assignment rules](../../../src/modules/tenancy/application/assign-template-role.ts), [wizard](../../../src/components/ui/custom-roles.tsx), [member assignment](../../../src/components/ui/member-role-assignment.tsx), [PostgreSQL coverage](../../../tests/beta/custom-roles-postgres.ts).

Milestone evidence: strict/unused types pass; actual owned PostgreSQL checks pass 19 custom-role cases plus 28 migration/lifecycle witnesses. Final unit/build/browser/race gates and full role coverage remain in progress. A host full-unit attempt was limited by sandbox loopback access; it is not recorded as a passing receipt. No retained demo migration, data reset, push or merge has occurred at this milestone.

## Follow-up Annotation Backlog

The owner requested that these be addressed after the milestone checkpoint, within the ongoing goal:

| Annotation | Required increment |
| --- | --- |
| 1, 4, 5 | Remove redundant standalone member-add controls; show actual project personnel prominently rather than confusing eligible accounts/admin candidates. Explain independent administration and preserve separate operational roles. |
| 2, 3 | Remove unnecessary admin back-to-top and compact selection controls without shrinking touch targets. |
| 5, 6 | Tenant Admin alone creates/grants Project Admin; gate UI and reject APIs independently. |
| 7 | Replace Project Admins task with a scoped help desk: project members submit assistance requests; Project/Tenant Admin investigate, resolve or escalate. Preserve an accessible Tenant Admin assignment workflow elsewhere. |
| 8 | Subcontractor access belongs on Companies. |
| 9 | Access and Recovery must offer explicitly confirmed restoration of removed project members, with fresh authorization, prior history and blocker evidence. |
| 10, 11 | Request Policy belongs within Project Settings; keep existing links compatible. |
| 12 | Explain protected reviewer handover using concrete responsibility/unfinished work language and document its actual purpose. |
| 13 | Diagnostics should present understandable measured health, scoped request/error context and observed timings; include meaningful donut proportions only where real values support them. Never substitute invented baselines or telemetry for measured data. |

A final 96-cell role/action matrix, core-workflow evidence, prioritized findings, wizard lifecycle receipt, open questions and independent finish/documentation will be linked here when complete. This checkpoint is not completion approval.
