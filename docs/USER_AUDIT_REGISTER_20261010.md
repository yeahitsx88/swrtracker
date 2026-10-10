# User audit register (2026-10-10)

Branch `alpha1-audit-hardening`. Evidence base: the five user-review files in `D:\Programming\SWRTracker\user-review\` (GN = General Notes, PA = Project Admin Role Notes, SM = Survey Manager, IM = Instrument Man, RQ = Requester). Directive: Consolidated User Audit Result (UAR-001…028).

Verification ran on the disposable review database (127.0.0.1:15491) in a real browser (Chrome/Playwright) and through direct API calls. A **pure Project Admin** fixture (`pa@amelia.local`) was granted through the real Tenant-Admin endpoint. It was needed because the reviewer's "Project Admin" account (`admin@amelia.local`) also holds **Tenant Admin**, which explains most of the Project Admin authority observations below.

Status key: **FIXED** (changed and verified) · **VERIFIED** (already correct, proven) · **PENDING** (needs a decision) · **DEFERRED** · **SUPERSEDED**.

## A. Shared UI and components

| ID | Source | Observed → Expected | Root cause | Disposition and evidence |
|---|---|---|---|---|
| UAR-001 | GN; PA Custom Roles and Help Desk | Completion messages never cleared and could not be closed → dismiss predictably | `SuccessBanner` and the admin-workspace notice had no lifecycle: editors keep their last result while mounted | **FIXED** (98c6e42). Shared `useDismissibleNotice`: close button, auto-dismiss after 8 s (paused on hover/focus), shown again only when the text changes. Messages asking someone to sign in again stay until dismissed. Applies to all 41 `SuccessBanner` uses and all 7 workspace notice publishers. Browser: company create, custom-role create/delete and Help Desk reply messages clear; unit test `notice-lifecycle.test.ts` |
| UAR-006 | PA Custom Roles and Help Desk | "Return to Custom Roles / Tenant Help Desk" stayed after the action → disappear | Workspace notice always rendered the return link, even on that section | **FIXED** (98c6e42). Link only appears when the editor lives on another section. Browser: no stale link after custom-role delete or Help Desk reply. Errors and in-progress states unchanged |
| UAR-005 | GN | New company name kept after creation → reset | Success path cleared the selection but not the inputs | **FIXED** (98c6e42). Company name, company ID and whitelist email reset. Browser: field empty after creation |
| UAR-004 | GN | Creation flows should follow the company popup review | Most creation flows already use a review step or dialog (company, custom role, member wizard, team editor, direct assignment) | **PARTLY VERIFIED / DEFERRED**. No flow lacks a confirmation step. Converting the remaining inline editors to popups is deferred as visual work (see UAR-015) |
| UAR-007 | PA Companies | Disabled-button tooltips are the right concept; refine later | — | **FIXED where silent**: the custom-role wizard (Next, Deploy/Delete) now explains itself, following the earlier batch-297 sweep. Visual polish deferred as the user asked |
| UAR-003 / UAR-027 | GN; IM | Width sliders → spreadsheet-style edge resizing on all tables | Resizing existed only on 2 of 41 shared tables; the rest had none, and sliders sat in the column panel | **FIXED** (98c6e42). Every `AdministrationRecords` table resizes by dragging the heading edge (keyboard arrows; double-click restores; widths saved per browser; natural layout until the first resize). Sliders removed. The departments, invitation-history and audit-log tables use the new shared `ResizableTable`. KPI heat-map excluded (a chart, not a data table). Browser: Crew Work (Instrument Man), Project Admin personnel, Review Requests and audit log widen, persist and restore |
| UAR-002 | SM; GN | Draggable containers everywhere | — | **PENDING** (decision D3). Home dashboard (all roles) is the reference, re-verified (15/15) after a regression found and fixed in a9beb56 |

## B. Security, administration and authorization

| ID | Source | Finding | Disposition and evidence |
|---|---|---|---|
| UAR-008 | GN; PA Personnel, Tenant Accounts | Project Admin must not grant or revoke Project Admin | **VERIFIED**. Grants have a single writer (`setProjectAdministrator`), gated to Tenant Admin in both route and application. Admin authority comes only from active `project_admin_grants`; a leftover `PROJECT_ADMIN` membership role grants nothing. As `pa@` (pure Project Admin), all 17 API probes were refused: grant, revoke another, revoke self, list assignments, create an employee with `projectAdmin:true`, set a membership role to `PROJECT_ADMIN` (400), self-promote to Tenant Admin, custom roles, templates, Central IT reviews, tenant accounts, audit log, an ungranted project, another tenant. UI shows no grant/revoke controls. The reviewer saw them because their account is also Tenant Admin |
| UAR-011 | PA Custom Roles | Project-created roles must stay project-scoped | **VERIFIED / SUPERSEDED**. Decision 55 makes custom roles a Tenant-Admin-owned tenant catalog that Project Admins only assign; there is no project-created role to propagate. Project Admin create/list → 403 |
| UAR-012 | PA Settings, Templates | Hide template pages and controls from Project Admin | **FIXED** (98c6e42). Template pages/APIs were already Tenant-Admin-only (403). The remaining read-only "Project Template" card in Project Settings now shows only to Tenant Admin (browser: absent for `pa@`, present for `admin@`) |
| UAR-013 | PA Central IT Reviews | Why does Project Admin see this? | **VERIFIED**. A pure Project Admin has no Tenant IT navigation and gets 403 on reviews. The page is the Tenant Admin's queue for Project Admin-flagged offboarding (Decision 33); the reviewer saw it as Tenant Admin. Naming falls under D2 |
| UAR-009 | PA Personnel | Should Requesters, Superintendents, Party Chiefs and Instrument Men also be Project Admins? | **PENDING** (D1). Today a grant is separate from and preserves the operational role (`operationalRolePreserved: true`, approved independent-administration model) |
| UAR-010 | GN | Central IT / Tenant IT / Central Admin / Tenant Admin are one role | **PENDING** (D2), with finding: in code these are one authority, `tenant_memberships.role = TENANT_ADMIN`; "Central IT" is a label (35 UI uses) and an audit `branch` value. No separate platform-wide role exists |
| UAR-014 | PA Tenant Accounts | Rename "Preview Tenant Disable"; popup; recorded reason | **PARTLY FIXED**. Renamed to "Disable account…" / "Disable selected accounts…" (runners updated). A 10–1000-character reason, current preview and confirmation are already required and audited. Popup and reason taxonomy **PENDING** (D6) |
| UAR-015 | PA Personnel | Popup wizard for role assignment | **DEFERRED** (user: "good for now") |

## C. Project Admin operations

| ID | Source | Disposition |
|---|---|---|
| UAR-016 | PA Companies | **FIXED** (98c6e42). The section both creates new companies and associates existing ones; titled "Create a Company", with the ID path labelled "Add an existing tenant company" so association is not misrepresented. Typing a name already finds existing tenant companies |
| UAR-017 | PA Companies | **PENDING** (D7): company details (roster, activity) |
| UAR-018 | PA Departments | **PENDING** (D4). Project Admin can already create departments during Setup; the approved setup lock blocks it after activation for everyone. Departments drive request tagging and department-manager/lead visibility |
| UAR-019 | PA Departments | **PENDING** (D5): department–company classifier (schema) |
| UAR-020 | PA Departments | **FIXED** (98c6e42). Root cause: the demo seeds (`seed-amelia-beta.ts`, `seed-sabine.ts`) inserted the Construction department without its head title, unlike `createDepartment`, which adds it as a MANAGER title. Seeds corrected; disposable DB backfilled. Databases already seeded (including retained ones) still need the one-row backfill |
| UAR-021 | PA Area | **FIXED** (98c6e42). Branches collapse; Expand all / Collapse all (browser verified) |
| UAR-022 | PA Diagnostics | **FIXED** (98c6e42). Investigate opens in the standard administration dialog (no error rows in the fixture to click; covered by typecheck and build) |
| UAR-023 | PA Settings | **FIXED** (98c6e42). Project Settings after Diagnostics (browser verified) |
| UAR-024 | PA Access and Recovery | **DEFERRED** (aesthetics) |

## D. Survey operations and personnel continuity

| ID | Source | Disposition |
|---|---|---|
| UAR-025 | SM Team Management | **PENDING** (D8): work moving with a promoted person |
| UAR-026 | SM | **VERIFIED**. A role change is refused while the person has assigned field work, field-report reviews, delegations, team-lead duty, crew/reporting links or Area/responsibility/acting grants, with a plain next step. Browser: promoting an Instrument Man with 3 assigned requests is refused; role unchanged. Nothing can be orphaned |
| UAR-027 | IM | **FIXED** with UAR-003 (Crew Work verified) |
| UAR-028 | RQ | **VERIFIED**. Full lifecycle regression after these changes (submit, approve, assign, start, delay attempt, complete: 16/16) plus 23/23 role and tenant boundary probes |

## Decision register (not implemented; recommendations for the owner)

| # | Decision | Finding | Recommendation | Trade-off |
|---|---|---|---|---|
| D1 | Project Admin plus an operational role (UAR-009) | Grant is separate and preserves the operational role (approved independent-administration model; small companies may combine roles) | Keep dual capability but let Tenant Admin choose per grant: "keep current role" or "Project Admin only". Never remove a role automatically while it has open obligations (reuse UAR-026 guards) | Forcing single-role breaks small-site staffing |
| D2 | One admin term (UAR-010) | Already one authority (`TENANT_ADMIN`); only labels differ | Use "Tenant Admin" everywhere in UI copy; keep `CENTRAL_IT` in stored audit evidence for history | Copy-only change across ~35 strings and runner labels |
| D3 | Draggable containers (UAR-002) | `HomeWidgets` is generic (cards keyed by title) and reusable without a new framework | Rule: rearrangeable only on overview pages made of 2+ independent read-only cards (Home for all roles, Survey Operations Overview tab). Not forms, wizards, dialogs, confirmation/review panels, work queues/tables, request detail, navigation or sticky action bars. Keep per-browser persistence; server-side per-account layout only if cross-device is wanted | Wider use adds little on single-purpose pages and risks hiding required steps |
| D4 | Department creation after activation (UAR-018) | Departments affect request tagging and department-role visibility | Allow Project Admin and Tenant Admin to add ordinary departments after activation (name and head title only, audited). Keep membership/role/Area changes governed | Relaxes the approved setup lock |
| D5 | Department–company link (UAR-019) | No company on departments today | Optional `company_id` on departments; display "Construction — Company"; existing rows unset | Schema migration; reporting and filters must account for it |
| D6 | Disable reasons (UAR-014) | Free-text reason already required | Reason list: Terminated, Resigned, Transferred, Other (comment required), stored as a prefix in the existing reason field (no schema change) | Policy wording |
| D7 | Company details (UAR-017) | Not present | Read-only dialog: identity, project roster, request count by month (no outcome metrics) | Moderate effort, low risk |
| D8 | Work follows a promoted person (UAR-025) | Today a role change is blocked until work is resolved | Offer the promotion with a review listing open work and a choice per item: keep (only where the new role may complete it) or reassign, applied in one audited transaction | Changes approved role/assignment rules |

## Regression evidence (this batch)

- **Units:** strict typecheck; 761 unit tests pass (new: `tests/ui/notice-lifecycle.test.ts`).
- **Browser:**
  - Lifecycle 16/16.
  - Dashboard 15/15. The rerun caught a `data-column` collision introduced in this batch, fixed in a9beb56.
  - Column resize 12/12 (Crew Work, Personnel, Review Requests) plus the audit log.
  - UAR UI 13/13.
  - Notice lifecycle 8/8.
  - Role-change refusal 1/1.
- **API:** pure Project Admin probes 17/17 refused; boundary probes 23/23 refused.
- **Runners:** five maintained runners were updated for renamed labels and the 180 px Number default (`node --check` passes). They were not executed: they need retained fixtures.
- **Not run:** PostgreSQL acceptance suites.
