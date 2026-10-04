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

## Administration and Support Milestone

Migration036 adds project-scoped help desk tickets, append-only replies and measured HTTP observations. All current project members can submit and reply to their own assistance requests. Project Admin handles the project queue; Tenant Admin handles all tenant projects and escalations. Neither workflow grants survey authority. Project Admin creation/grant/revocation now requires Tenant Admin independently in the API, including employee provisioning and replay checks.

Personnel shows the actual member roster and current administrator grants. Removed-member restoration uses reviewed session/removal stamps, explicit consent and a reason; it renews sessions and preserves earlier history. It does not restore revoked independent administration or crew/reporting assignments. Subcontractor access is in Companies, request policy is in Project Settings, old tab links remain compatible, and area review handover explains unfinished review responsibilities.

Diagnostics uses measured proportions and response timings from verified project/visible-request routes. It shows scoped error status, actor, route, correlation reference and prior request state, plus submission notification dispatch/capture timing. It excludes request bodies, credentials, raw exception messages and SQL. No history is backfilled and no sample baseline is invented. Notification dispatch is not a read receipt or a browser-click-to-survey-team latency measurement. Observation recording is best effort; missing observations are not evidence that errors did not occur.

Milestone verification: strict/unused types and all 584 unit tests pass; owned PostgreSQL checks pass 39 support/restoration, 19 custom-role, 21 employee and 57 project-administration cases, with each helper also verifying 28 migration/lifecycle witnesses. The pinned Node 22.23.3 / pnpm 11.19.0 production builder passes. Full PostgreSQL, production HTTP/browser, telemetry failure/race and independent design finish remain ongoing. Retained demo data and runtime remain untouched.

Source map: [migration036](../../../db/migrations/036_project_support.sql), [help desk rules](../../../src/modules/support/application/help-desk.ts), [member restoration](../../../src/modules/tenancy/application/restore-project-member.ts), [Help Desk UI](../../../src/components/ui/help-desk.tsx), [diagnostics UI](../../../src/components/ui/project-diagnostics.tsx), [HTTP observer](../../../src/lib/observe-project-route.ts), [PostgreSQL checks](../../../tests/beta/project-support-postgres.ts).

A final 96-cell role/action matrix, core-workflow evidence, prioritized findings, wizard lifecycle receipt, open questions and independent finish/documentation will be linked here when complete. This checkpoint is not completion approval.
