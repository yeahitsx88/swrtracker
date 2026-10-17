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

## Role × Action Coverage

The 96 cells below evaluate the matrix **after the approved clarifications**. Pass means a permitted action has a reachable bound control with authorization/scope checks, or a prohibited action has no operative control and is rejected independently. Incomplete permitted paths are findings even when a subset works. Sources and current executable receipts are identified below; this does not claim 96 independently executed browser mutations. Current membership and Setup/Archived restrictions still apply.

| Action | Tenant Admin | Project Admin | Survey Manager | Superintendent | Party Chief | Instrument Man | Requester | Viewer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Project Creation | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Role Creation | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Role Assignment | UI missing¹ | UI missing¹ | Pass | API missing² | Pass | Pass | Pass | Pass |
| Add Project Member | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| External Company Creation | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Project Admin Assignment | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Project Access (grant/remove) | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Survey Role Promotion | UI missing¹ | UI missing¹ | Pass | API missing² | Pass | Pass | Pass | Pass |
| Survey Role Removal | API missing¹ | API missing¹ | Pass | API missing² | Pass | Pass | Pass | Pass |
| Survey Team Management | Pass | Pass | Pass | Pass³ | Pass | Pass | Pass | Pass |
| Access and Recover | API missing⁴ | API missing⁴ | API missing⁴ | API missing⁴ | API missing⁴ | Pass | Pass | Pass |
| Diagnostics | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Pass |

1. Administrators create fixed/custom-role members, assign existing Requester/Viewer templates, manage project access and appoint a Superintendent as Manager through protected handover. They do not have a general existing-survey-role promotion/demotion workflow. The general role endpoint is Manager-only; access removal is a distinct action from survey-role removal. These cells record the incomplete permission, not just its functioning subset.
2. Superintendent can move assigned Instrument Men between Chiefs in the same supervised chain, but cannot change assigned Chiefs' roles, promote an Instrument Man or remove a supervised person's survey role. The scoped role endpoints and controls are absent.
3. Superintendent Team Management means its scoped crew-transfer operation. Manager manages named teams/project-wide crew structure. Chief has an assigned-workforce **read-only** view; no transfer/save controls. Administrators acquire no crew-structure operations from administration alone. An actual Manager with an independent administrator grant retains Manager operations.
4. Administrators recover deleted drafts and removed membership access. No cancelled/rejected **submitted-request** recovery endpoint or UI returns a request to Returned for Correction. This is incomplete for all five permitted roles. Ordinary requester correction/resubmission does not confer administrative recovery.

### UI, API and Enforcement Map

| Action | UI and endpoint | Authorization / scope evidence |
| --- | --- | --- |
| Project Creation | Projects launcher / Create Project → `POST /api/projects` | `project-creation.tsx`, `api/projects/route.ts`: current Tenant Admin, same-tenant template, Setup gates |
| Role Creation | Tenant Custom Roles / Add Role → `POST /api/roles`; edit/delete → `/api/roles/[roleId]` | tenant server layout, `custom-roles.tsx`, `custom-roles.ts`, migration035; Tenant Admin before replay |
| Role Assignment | Personnel / Assign Role → `PATCH …/members/[userId]/role`; Manager / New Role → `PATCH …/survey/teams` | `assign-template-role.ts`: active scoped member, exact catalog/session version, Requester/Viewer only; `change-survey-role.ts`: actual Manager plus obligation checks; scoped Superintendent path missing |
| Add Project Member | Personnel / Person-Access-Review → `POST …/employees` or `POST …/members` | `create-project-employee.ts`, `add-project-member.ts`: current project administration, active same-tenant subject/company, association rules; no public registration expansion |
| External Company Creation | Companies / Register or Associate → `POST …/companies` | `project-administration.ts`: scoped administration and writable project; same-tenant association |
| Project Admin Assignment | Tenant Admin Personnel / Create Project Admin or explicit grant → `POST …/employees`, `POST …/administrators` | **Tenant Admin** before replay/provisioning/grant; eligible GC/Owner Representative; independent authority preserves operational role |
| Project Access | Member wizard; Preview Access Removal → `POST …/members/[userId]/offboarding`; Restore Removed Members → `POST …/members/[userId]/restore` | blocker preview, fresh administration, reviewed session/removal stamp and atomic evidence; no implicit restoration of revoked administration or staffing |
| Survey Promotion / Removal | Manager / New Role; administrator protected Manager appointment only | `change-survey-role.ts`, `save-survey-staffing.ts`, Manager handover; general administrator and scoped Superintendent paths missing |
| Survey Team Management | Manager / Team Management → `…/survey/teams`, `…/survey/staffing`, `…/survey/reorganization`; Superintendent / Reassign Crew → `…/survey/workforce` | actual Manager; or actual Superintendent plus current reporting/roster/Area witnesses in `survey-workforce.ts`; Chief read-only |
| Access and Recover | Admin / Deleted Drafts → `POST …/drafts/[ticketId]/restore`; submitted recovery missing | `draft-access.ts`, `recover-draft.ts`: current Tenant Admin or independent Project Admin, retained 30-day window, active requester/version; no submitted recovery handler |
| Diagnostics | Admin / Load Project Diagnostics → `GET …/diagnostics`; Investigate → scoped metadata and Help Desk escalation | current administration under SHARED barrier; verified project/visible-request observations; no unrestricted raw logs or foreign-project errors |

Ellipses in project endpoints mean `/api/projects/[projectId]`. UI files are under `src/components/ui`; rules are under `src/modules/tenancy/application` or `src/modules/ticket/application`. The checkpoint source maps above provide direct links.

### Prioritized Issues

- **Critical:** no new confirmed server permission hole in the verified catalog/support/admin paths. This is not an exhaustive repository security clearance.
- **High:** general administrator survey promotion/removal and scoped Superintendent role assignment/promotion/removal are missing. Implement obligation-aware role endpoints without granting administrator crew-structure management as a workaround.
- **High:** cancelled/rejected submitted-request recovery is missing. Preserve request identity/history, create an explicit correction cycle, enforce current Area/Chief scope and notify the requester. The Chief-assignment question below remains open.
- **Medium:** diagnostic prior state and sanitized error metadata are not a screen/form replay, distributed trace or arbitrary server log. Notification queue-to-dispatch/capture is not browser-click-to-team-receipt latency. Define event boundaries before adding end-to-end or tenant-wide diagnostics.
- **Medium:** large admin inventories still read repeated bounded API pages into a client collection. The tenant role catalog also needs scalable server pagination/search for large populations.
- **Low:** the detector's incumbent fluid-heading type-ramp advisory is preserved; no unapproved token-system repair.

### Core Functional Audit

| Role | Core reachable workflows / guards | Limit |
| --- | --- | --- |
| Requester | Home / New Request / Requests / Drafts; requester intake, submit/resubmit, own request/version guards; production Help Desk submission | No administrative recovery; ordinary correction/resubmission stays distinct |
| Party Chief | Crew Work / PC Approvals; explicit assignment and Area visibility, PC approve/reject/start/field review; assigned workforce read-only | No team mutation/member administration; submitted recovery absent |
| Instrument Man | Crew Work; assigned visibility and parent-authorized field attachment upload | Placeholder examples do not approve arbitrary task-state transitions |
| Viewer | All Requests; authorized status/detail/history with no creation/workflow mutation controls; support only via Help Desk | Not a universal tenant reader; support does not grant survey transitions |
| Survey Manager | Survey Operations / Team Management / All Requests; actual Manager checks on roles and staffing | Administration requires a separate grant; submitted recovery absent |
| Superintendent | Scoped requests, Area review and supervised crew transfer | Assigned Chief role changes, Instrument Man promotion and supervised role removal absent |
| Project Admin | Personnel, Companies, Project Settings, Access and Recovery, Diagnostics, Help Desk | No project/custom-role/Project Admin creation authority; no automatic survey operations |
| Tenant Admin | Tenant Accounts, Central IT Reviews, Project Templates, Custom Roles, tenant Help Desk and project administration | Tenant authority alone grants no operational request visibility |

Current-source domain/unit and PostgreSQL regressions preserve core guards. The new eight-role production run verifies administrative deep links, catalog gates and support authority; it does not claim browser execution of every field transition.

### Wizard Results and Open Questions

Tests reject reserved system names, duplicate normalized names, empty/control/overlong names and unsupported templates. Exact Requester/Viewer inheritance is verified. Deploy/assign/edit/delete covers existing and future projects, catalog conflicts, propagation/session renewal, assignment deletion blocks, foreign scope and audit rollback. Browser deployment completes all three steps; direct APIs reject all seven other roles. Project Admin assignment counts are scoped to its project; Tenant Admin retains tenant-wide counts.

Resolved anomalies: custom-role creation is Tenant Admin-only; Project Access is grant/remove; actual survey leaders manage crew structure while administrators manage roles/access; Superintendent removal requires supervised membership and resolved obligations. These are user decisions, not inferred matrix repairs.

**Pending:** cancellation clears active Chief assignment. Should the last recorded Chief assignment before cancellation establish recovery ownership, provided that Chief still covers the Area? The previously asked question remains pending. Submitted recovery cannot be marked implemented or passing without resolving this case. Approved recovery returns the request to Returned for Correction for requester revision/resubmission.

### Resolved Conditional UI Findings

The existing-account wizard now retains the selected person's company type, limits subcontractor role choices to Requester templates and resets role/consent when the person changes. Both Tenant Admin and Project Admin conditional checks pass before review; server eligibility remains authoritative. Add Project Member cells pass for this inspected path.

Removed-member restoration receives the current project's lifecycle gate. Archived or unverifiable lifecycle disables review/restore with an explanation, while retained membership inspection remains available. Active restoration, exact retry and sibling feedback pass; direct Archived restoration returns409 without membership/session/evidence changes. These two findings were corrected in the second listed material-fix batch; final reviewer scoring is recorded in the evidence artifact.

### Final Verification and Local Inspection Refresh

Current source passes strict/unused types, 584 units and the pinned production build; all30 PostgreSQL suites, 21 custom-role and42 support/restoration cases; 67 HTTP,50 browser,15 shared-notice and19 focused eligibility/lifecycle checks. These scoped receipts establish the implemented extension, not every missing matrix workflow. The Impeccable reviewer scored the final two material fixes resolved (ship at listed-fix scope), with earlier shared feedback preserved. Documenter compared the extension with the incumbent and preserved DESIGN/sidecar.

The retained inspection demo at3124 now runs the verified image with only additive migrations035/036. Before/after row digests match existing users/preferences, requests/events/files, projects/memberships/teams, independent administration and lifecycle evidence. Its original file volume and environment remain. Actual in-app inspection confirms Alex Rivera's existing session, separate Help Desk/Project Settings navigation and measured diagnostics; absent historical timing is explicitly empty. No credential/data reset, push, merge or Alpha2 initialization.
